#!/usr/bin/env bash
# Nightly backup of the VPS database (fms_db) from the compose `db` container.
#
#   bash ~/fms/deploy/backup-db.sh          # dump, verify, prune
#   bash ~/fms/deploy/backup-db.sh --drill  # restore the newest dump into a
#                                           # throwaway database and compare
#                                           # every table's row count with fms_db
#
# Crontab (VPS):   30 2 * * * bash ~/fms/deploy/backup-db.sh
# Off-site (D15):  weekly, on the owner's PC:
#   scp "<user>@<vps-ip>:fms-backups/fms_db-*.dump" D:\fms-backups\
#
# Dumps:  ~/fms-backups/fms_db-YYYY-MM-DD.dump (custom format, pg_restore-able)
# Log:    ~/fms-backups/backup.log — one timestamped OK / FAILED line per run
# Keeps:  the 14 newest dumps, plus the 8 newest Sunday dumps (weekly).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/fms-backups}"
DB_NAME=fms_db
DB_USER=fms_app
KEEP_DAILY=14
KEEP_WEEKLY=8

# docker compose needs the project directory (where docker-compose.yml lives)
cd "$(dirname "$(readlink -f "$0")")/.."
mkdir -p "$BACKUP_DIR"
LOG="$BACKUP_DIR/backup.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %z') $*" | tee -a "$LOG"; }

# `sg docker` because cron and fresh SSH sessions may not carry the docker
# group. sg runs /bin/sh, so pass only plain words here — SQL goes on stdin.
dc() { sg docker -c "docker compose $*"; }
# Runs the SQL given on stdin against database $1, one unaligned row per line
psql_db() { dc exec -T db psql -U "$DB_USER" -v ON_ERROR_STOP=1 -X -At -d "$1"; }

# Every table in every non-system schema, with its exact row count, sorted.
ROW_COUNTS_SQL="
SELECT format('%I.%I', table_schema, table_name) || ' ' ||
       (xpath('/row/c/text()', query_to_xml(
          format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
          false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1"

# Globals, not locals: the EXIT traps below read them after the function returns
drill_db=""
partial=""

drill() {
  local dump counts_live counts_drill
  dump=$(ls -1 "$BACKUP_DIR"/fms_db-*.dump 2>/dev/null | sort | tail -n 1 || true)
  [[ -n "$dump" ]] || { log "drill FAILED: no dump in $BACKUP_DIR"; exit 1; }

  drill_db="fms_drill_$(date +%s)"
  trap 'if [[ -n "$drill_db" ]]; then psql_db postgres <<< "DROP DATABASE IF EXISTS $drill_db" >/dev/null 2>&1 || true; fi' EXIT

  echo "Restoring $(basename "$dump") into $drill_db ..."
  psql_db postgres <<< "CREATE DATABASE $drill_db" >/dev/null
  if ! dc exec -T db pg_restore -U "$DB_USER" -d "$drill_db" --no-owner --exit-on-error < "$dump"; then
    log "drill FAILED: pg_restore of $(basename "$dump") failed"
    exit 1
  fi

  counts_drill=$(psql_db "$drill_db" <<< "$ROW_COUNTS_SQL")
  counts_live=$(psql_db "$DB_NAME" <<< "$ROW_COUNTS_SQL")

  # Rows written to fms_db after the dump was taken show up as differences;
  # run the drill right after a backup (or while no one is writing).
  if [[ "$counts_live" == "$counts_drill" ]]; then
    column -t <<< "$counts_drill"
    log "drill OK: $(basename "$dump") restored, $(wc -l <<< "$counts_drill") tables, all row counts match $DB_NAME"
  else
    echo "Differences (< $DB_NAME   > restored dump):"
    diff <(echo "$counts_live") <(echo "$counts_drill") || true
    log "drill FAILED: row counts of $(basename "$dump") differ from $DB_NAME"
    exit 1
  fi
}

prune() {
  # Newest first; names sort by date. Keep the KEEP_DAILY newest, plus the
  # KEEP_WEEKLY newest taken on a Sunday.
  local f d daily=0 weekly=0 keep
  for f in $(ls -1 "$BACKUP_DIR"/fms_db-*.dump | sort -r); do
    keep=no
    if (( daily < KEEP_DAILY )); then keep=yes; daily=$((daily + 1)); fi
    d=$(basename "$f" .dump); d=${d#fms_db-}
    if [[ $(date -d "$d" +%u 2>/dev/null || true) == 7 ]] && (( weekly < KEEP_WEEKLY )); then
      keep=yes; weekly=$((weekly + 1))
    fi
    if [[ $keep == no ]]; then rm -f "$f"; fi
  done
}

backup() {
  local name final size
  name="fms_db-$(date +%F).dump"
  final="$BACKUP_DIR/$name"
  partial="$final.partial"
  # Never leave a half-written file behind, whatever fails
  trap 'rm -f "$partial"' EXIT

  if ! dc exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$partial"; then
    log "backup FAILED: pg_dump failed"
    exit 1
  fi
  # Read the whole dump back before trusting it
  if ! dc exec -T db pg_restore -f /dev/null < "$partial"; then
    log "backup FAILED: $name does not read back (pg_restore -f /dev/null)"
    exit 1
  fi
  mv -f "$partial" "$final"
  size=$(du -h "$final" | cut -f1)
  prune
  log "backup OK: $name ($size)"
}

case "${1:-}" in
  --drill) drill ;;
  "")      backup ;;
  *)       echo "usage: $0 [--drill]" >&2; exit 2 ;;
esac
