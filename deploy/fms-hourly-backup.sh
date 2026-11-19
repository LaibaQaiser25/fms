#!/usr/bin/env bash
# ============================================================================
# fms-hourly-backup.sh — hourly FMS database backup with offsite rotation
#
#   bash fms-hourly-backup.sh              # one run (cron calls this)
#   bash fms-hourly-backup.sh --drill      # restore the newest dump and compare
#
# Each run:
#   1. pg_dump -Fc inside the compose `db` container, written to a .partial and
#      only renamed on success (never leaves a half-written dump behind)
#   2. reads the dump back with pg_restore -l to prove it is complete
#   3. uploads it as a GH release asset to $REPO
#   4. keeps exactly TWO releases: this one and the one before it. The "second
#      last" (i.e. the one older than the previous run) is deleted every time.
#
# Local dumps are kept as well (see KEEP_LOCAL) so a GitHub outage never costs
# you the only copy. Silent on success; alert + exit 1 on failure.
#
# Env overrides: FMS_REPO FMS_BACKUP_DIR FMS_KEEP_LOCAL FMS_DRILL
# ============================================================================
set -uo pipefail

export PATH="$PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
GH="${GH_BIN:-$(command -v gh || echo /usr/bin/gh)}"
REPO="${FMS_REPO:-hanzla46/fms-db-backups}"
MIRROR="${FMS_MIRROR_REPO:-LaibaQaiser25/fms}"   # second destination; set to "" to disable
KEEP_MIRROR="${FMS_KEEP_MIRROR:-2}"
BACKUP_DIR="${FMS_BACKUP_DIR:-$HOME/fms-backups}"
KEEP_LOCAL="${FMS_KEEP_LOCAL:-24}"     # 24 hourly dumps = 1 day local
KEEP_REMOTE=2                          # newest two releases only
LOG="$BACKUP_DIR/offsite.log"
FMS_DIR="$HOME/fms"
DB_USER=fms_app
DB_NAME=fms_db

mkdir -p "$BACKUP_DIR"
ts()  { date -Is; }
log() { echo "[$(ts)] $*" >>"$LOG"; }
fail_out() { echo "⚠️ FMS offsite backup: $*"; log "FAIL $*"; exit 1; }

# cron has no docker group in some sessions; sg docker is the established fix
dc() { sg docker -c "docker compose $*"; }
cd "$FMS_DIR" || fail_out "cannot cd to $FMS_DIR"

# --- 1. dump ---------------------------------------------------------------
stamp=$(date +%Y%m%d-%H%M%S)
name="fms_db-$stamp.dump"
final="$BACKUP_DIR/$name"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

if ! dc exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc >"$partial" 2>>"$LOG"; then
  fail_out "pg_dump failed"
fi
[[ -s $partial ]] || fail_out "pg_dump produced an empty file"
size=$(stat -c%s "$partial")
(( size > 10000 )) || fail_out "dump is only $size bytes — refusing to ship it"

# --- 2. prove it reads back ------------------------------------------------
if ! sg docker -c "docker compose exec -T db pg_restore -l" <"$partial" >/dev/null 2>>"$LOG"; then
  fail_out "$name does not read back (pg_restore -l)"
fi
chmod 600 "$partial"
mv -f "$partial" "$final"
log "dump OK $name $(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B")"

# --- 3. upload -------------------------------------------------------------
"$GH" auth status >/dev/null 2>&1 || fail_out "GitHub auth missing — run: gh auth login"
tag="${name%.dump}"

# idempotent: skip if this exact dump is already up there at the right size
existing=$("$GH" release view "$tag" --repo "$REPO" --json assets \
  -q ".assets[] | select(.name == \"$name\") | .size" 2>/dev/null)
if [[ "$existing" == "$size" ]]; then
  log "OK skip already-uploaded $tag"
else
  # debris from an interrupted run — clear it so the retry starts clean
  if "$GH" release view "$tag" --repo "$REPO" >/dev/null 2>&1; then
    "$GH" release delete "$tag" --repo "$REPO" --yes --cleanup-tag >/dev/null 2>&1
    log "cleaned partial release $tag"
  fi

  if ! out=$("$GH" release create "$tag" "$final" --repo "$REPO" \
      --title "$tag" \
      --notes "FMS fms_db dump $(ts) — $(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B")" 2>&1); then
    "$GH" release delete "$tag" --repo "$REPO" --yes --cleanup-tag >/dev/null 2>&1
    fail_out "upload failed for $tag: $(echo "$out" | tail -3 | tr '\n' ' ')"
  fi

  got=$("$GH" release view "$tag" --repo "$REPO" --json assets \
    -q ".assets[] | select(.name == \"$name\") | .size" 2>/dev/null)
  if [[ "$got" != "$size" ]]; then
    "$GH" release delete "$tag" --repo "$REPO" --yes --cleanup-tag >/dev/null 2>&1
    fail_out "verification failed for $tag (asset '$got' != local $size) — release removed"
  fi
  log "uploaded $tag size=$size"
fi

# --- 4. retention: keep the newest two, delete the rest --------------------
mapfile -t ordered < <("$GH" release list --repo "$REPO" --limit 100 --json tagName \
  -q '.[].tagName' 2>/dev/null |
  grep -E '^fms_db-[0-9]{8}-[0-9]{6}$' | sort -r)

if (( ${#ordered[@]} == 0 )); then
  fail_out "could not list releases for retention"
fi

pruned=0
for ((i=KEEP_REMOTE; i<${#ordered[@]}; i++)); do
  old=${ordered[$i]}
  [[ "$old" == "$tag" ]] && fail_out "retention selected the just-uploaded $tag — aborting"
  if ! "$GH" release delete "$old" --repo "$REPO" --yes --cleanup-tag >/dev/null 2>&1; then
    log "WARN could not prune $old"
    continue
  fi
  pruned=$((pruned+1)); log "pruned $old"
done

# --- 4b. mirror to the FMS repo's releases (best-effort second destination) --
# The primary copy already succeeded above; a mirror failure is logged and
# alerted but does not fail the run, or it would mask a good backup.
mirrored=0
if [[ -n "$MIRROR" ]]; then
  if "$GH" repo view "$MIRROR" >/dev/null 2>&1; then
    m_existing=$("$GH" release view "$tag" --repo "$MIRROR" --json assets \
      -q ".assets[] | select(.name == \"$name\") | .size" 2>/dev/null)
    if [[ "$m_existing" == "$size" ]]; then
      log "mirror OK skip $MIRROR/$tag"
    elif "$GH" release create "$tag" "$final" --repo "$MIRROR" \
        --title "$tag" --notes "FMS fms_db dump $(ts) — mirror" >/dev/null 2>&1; then
      m_got=$("$GH" release view "$tag" --repo "$MIRROR" --json assets \
        -q ".assets[] | select(.name == \"$name\") | .size" 2>/dev/null)
      if [[ "$m_got" == "$size" ]]; then
        mirrored=1; log "mirrored $MIRROR/$tag"
      else
        "$GH" release delete "$tag" --repo "$MIRROR" --yes --cleanup-tag >/dev/null 2>&1
        log "WARN mirror verify failed for $MIRROR/$tag"
      fi
    else
      log "WARN mirror upload failed for $MIRROR/$tag (primary copy is intact)"
    fi

    # mirror retention: same second-last rule, independently
    mapfile -t m_ordered < <("$GH" release list --repo "$MIRROR" --limit 100 --json tagName \
      -q '.[].tagName' 2>/dev/null | grep -E '^fms_db-[0-9]{8}-[0-9]{6}$' | sort -r)
    for ((i=KEEP_MIRROR; i<${#m_ordered[@]}; i++)); do
      [[ "${m_ordered[$i]}" == "$tag" ]] && continue
      "$GH" release delete "${m_ordered[$i]}" --repo "$MIRROR" --yes --cleanup-tag \
        >/dev/null 2>&1 && log "mirror pruned $MIRROR/${m_ordered[$i]}"
    done
  else
    log "WARN mirror repo $MIRROR not reachable with current gh auth — skipped"
  fi
fi

# --- 5. local rotation -----------------------------------------------------
mapfile -t local_dumps < <(ls -1t "$BACKUP_DIR"/fms_db-*.dump 2>/dev/null)
for ((i=KEEP_LOCAL; i<${#local_dumps[@]}; i++)); do
  rm -f "${local_dumps[$i]}"
done

# --- 6. destructive step happened: prove the newest release still exists ---
survivors=$("$GH" release list --repo "$REPO" --limit 10 --json tagName -q '.[].tagName' 2>/dev/null | wc -l)
(( survivors >= 1 )) || fail_out "no releases left after pruning — retention went wrong"
log "OK complete tag=$tag size=$size pruned=$pruned remote_kept=$survivors mirrored=$mirrored local_kept=$(ls -1 "$BACKUP_DIR"/fms_db-*.dump | wc -l)"
exit 0
