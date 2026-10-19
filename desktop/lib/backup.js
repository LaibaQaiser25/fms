// Factory backups (SYNC-HARDENING-PLAN.md T2.5, D10, D15). Plain Node (no
// Electron), so main.js and host.js both run it.
//
// - pg_dump -Fc every 6 h while FMS runs, plus one when it closes. The
//   database only exists while FMS runs, so the schedule lives here rather
//   than in a Windows scheduled task, which would find no server to dump.
// - Each dump is taken inside one REPEATABLE READ snapshot that also counts
//   every table's rows (pg_dump --snapshot), and the counts are kept next to
//   the dump (<name>.counts.json). The restore drill compares against those,
//   so it matches exactly even while the factory keeps working.
// - A dump is read all the way through (pg_restore -f <null>) before it is
//   kept; a failed or unreadable one leaves no file behind.
// - Keeps every dump of the last 24 h, the newest of each of the 14 newest
//   days, and the newest of each of the 8 newest weeks. (Not "Sundays" as on
//   the VPS: the factory PC may well be off on Sundays.)
// - The folder should be on a second drive (cfg.backupDir); status shows
//   amber while it is on the same drive as the database.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { Client } = require('pg');

const BACKUP_EVERY_MS = 6 * 3600_000;
const KEEP_DAILY = 14;
const KEEP_WEEKLY = 8;
const NAME_RE = /^fms_db-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})\.dump$/;

// pg_dump / pg_restore. On Windows they ship in desktop/tools/ (scripts/
// fetch-tools.js) and load the embedded Postgres's DLLs from its bin folder.
// Elsewhere (tests) they come from PATH, or FMS_PG_TOOLS_DIR.
async function pgTool(name) {
  if (process.env.FMS_PG_TOOLS_DIR) return { file: path.join(process.env.FMS_PG_TOOLS_DIR, name), env: process.env };
  if (process.platform !== 'win32') return { file: name, env: process.env };
  const { pg_ctl } = await import('@embedded-postgres/windows-x64');
  return {
    file: path.join(__dirname, '..', 'tools', `${name}.exe`),
    env: { ...process.env, PATH: `${path.dirname(pg_ctl)};${process.env.PATH || ''}` },
  };
}

// The password goes in PGPASSWORD, never on a command line other users of
// the PC could read.
function connArgs(databaseUrl) {
  const u = new URL(databaseUrl);
  return {
    args: ['-h', u.hostname, '-p', u.port || '5432', '-U', decodeURIComponent(u.username)],
    db: decodeURIComponent(u.pathname.slice(1)),
    password: decodeURIComponent(u.password),
  };
}

async function run(name, args, { password, timeoutMs = 0 } = {}) {
  const { file, env } = await pgTool(name);
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      env: { ...env, PGPASSWORD: password },
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        const why = err.killed ? `stopped after ${timeoutMs / 1000} s` : String(stderr || err.message).trim().split('\n').slice(-3).join(' ');
        reject(new Error(`${name} failed: ${why}`));
      } else resolve(stdout);
    });
  });
}

const pad = (n) => String(n).padStart(2, '0');
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function dateOf(name) {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [y, mo, d] = m[1].split('-').map(Number);
  return new Date(y, mo - 1, d, Number(m[2]), Number(m[3]), Number(m[4]));
}

async function countRows(client) {
  const { rows: tables } = await client.query(
    `SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS t
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY 1`
  );
  const counts = {};
  for (const { t } of tables) {
    counts[t] = (await client.query(`SELECT count(*)::bigint AS n FROM ${t}`)).rows[0].n * 1;
  }
  return counts;
}

// Dumps, verifies and keeps one backup; then prunes old ones.
// Resolves { file, bytes, tables, rows }.
async function backupNow({ databaseUrl, dir, now = new Date(), timeoutMs = 0 }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `fms_db-${stamp(now)}.dump`);
  const partial = `${file}.partial`;
  const { args, db, password } = connArgs(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    let counts;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const { rows: [{ snap }] } = await client.query('SELECT pg_export_snapshot() AS snap');
      counts = await countRows(client);
      // The snapshot stays valid only while this transaction is open.
      await run('pg_dump', [...args, '-d', db, '-Fc', `--snapshot=${snap}`, '-f', partial], { password, timeoutMs });
    } finally {
      await client.query('ROLLBACK').catch(() => {});
    }
    await run('pg_restore', ['-f', os.devNull, partial], { timeoutMs });
    fs.writeFileSync(`${file}.counts.json`, JSON.stringify({ takenAt: now.toISOString(), counts }, null, 1));
    fs.renameSync(partial, file);
  } catch (err) {
    fs.rmSync(partial, { force: true });
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
  prune(dir, now);
  const counts = JSON.parse(fs.readFileSync(`${file}.counts.json`, 'utf8')).counts;
  return {
    file,
    bytes: fs.statSync(file).size,
    tables: Object.keys(counts).length,
    rows: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}

// Newest first.
function listBackups(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => NAME_RE.test(n))
    .sort()
    .reverse()
    .map((n) => ({ name: n, file: path.join(dir, n), date: dateOf(n) }));
}

// ISO-ish week key: the Monday the dump's week starts on.
function weekOf(d) {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toDateString();
}

// Returns the names it deleted.
function prune(dir, now = new Date()) {
  const keep = new Set();
  const days = new Set();
  const weeks = new Set();
  for (const b of listBackups(dir)) {
    if (now - b.date < 24 * 3600_000) keep.add(b.name);
    const day = b.date.toDateString();
    if (!days.has(day) && days.size < KEEP_DAILY) { days.add(day); keep.add(b.name); }
    const week = weekOf(b.date);
    if (!weeks.has(week) && weeks.size < KEEP_WEEKLY) { weeks.add(week); keep.add(b.name); }
  }
  const deleted = [];
  for (const b of listBackups(dir)) {
    if (keep.has(b.name)) continue;
    fs.rmSync(b.file, { force: true });
    fs.rmSync(`${b.file}.counts.json`, { force: true });
    deleted.push(b.name);
  }
  // Leftovers: counts without a dump, partials from a crash (not the one being written now).
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (n.endsWith('.dump.counts.json') && !fs.existsSync(f.slice(0, -'.counts.json'.length))) fs.rmSync(f, { force: true });
    if (n.endsWith('.dump.partial') && now - fs.statSync(f).mtime > 3600_000) fs.rmSync(f, { force: true });
  }
  return deleted;
}

// Restore drill: restores a dump into a throwaway database on the same
// server, compares every table's row count with the counts taken with the
// dump, then drops it. Resolves { ok, file, tables, rows, mismatches }.
async function restoreDrill({ databaseUrl, file }) {
  const { args, password } = connArgs(databaseUrl);
  const expected = JSON.parse(fs.readFileSync(`${file}.counts.json`, 'utf8')).counts;
  const drillDb = `fms_drill_${Date.now()}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${drillDb}`);
    await run('pg_restore', [...args, '-d', drillDb, '--no-owner', '--exit-on-error', file], { password });
    const drillUrl = new URL(databaseUrl);
    drillUrl.pathname = `/${drillDb}`;
    const drill = new Client({ connectionString: drillUrl.toString() });
    await drill.connect();
    let got;
    try { got = await countRows(drill); } finally { await drill.end(); }
    const mismatches = [...new Set([...Object.keys(expected), ...Object.keys(got)])]
      .filter((t) => expected[t] !== got[t])
      .map((t) => ({ table: t, expected: expected[t] ?? null, restored: got[t] ?? null }));
    return {
      ok: mismatches.length === 0,
      file,
      tables: Object.keys(got).length,
      rows: Object.values(got).reduce((a, b) => a + b, 0),
      mismatches,
    };
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${drillDb} WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
}

function sameDrive(a, b) {
  try {
    fs.mkdirSync(a, { recursive: true });
    return fs.statSync(a).dev === fs.statSync(b).dev;
  } catch {
    return path.parse(path.resolve(a)).root.toLowerCase() === path.parse(path.resolve(b)).root.toLowerCase();
  }
}

// Every 6 h while FMS runs (checked every 10 min, first 2 min after start),
// and once more from stop(). One backup at a time.
//   getDir() -> the backup folder (it can change from the menu while running)
class BackupScheduler {
  constructor({ databaseUrl, getDir, pgDataDir, log, everyMs = BACKUP_EVERY_MS, checkMs = 10 * 60_000, firstCheckMs = 2 * 60_000 }) {
    Object.assign(this, { databaseUrl, getDir, pgDataDir, log, everyMs, checkMs, firstCheckMs });
    this.timers = [];
    this.running = null;
    this.lastError = null;
    this.lastDrill = null;
  }

  start() {
    this.timers.push(setTimeout(() => this.check(), this.firstCheckMs));
    this.timers.push(setInterval(() => this.check(), this.checkMs));
  }

  newest() {
    return listBackups(this.getDir())[0] || null;
  }

  check() {
    const last = this.newest();
    if (!last || Date.now() - last.date >= this.everyMs) this.run('scheduled').catch(() => {});
  }

  // Resolves the backupNow result; rejects (and remembers why) on failure.
  run(reason, { timeoutMs = 0 } = {}) {
    if (this.running) return this.running;
    const dir = this.getDir();
    this.running = (async () => {
      try {
        const r = await backupNow({ databaseUrl: this.databaseUrl, dir, timeoutMs });
        this.lastError = null;
        this.log(`backup OK (${reason}): ${r.file} (${Math.round(r.bytes / 1024)} KB, ${r.tables} tables, ${r.rows} rows)`);
        return r;
      } catch (err) {
        this.lastError = { at: new Date().toISOString(), message: err.message };
        this.log(`backup FAILED (${reason}): ${err.message}`);
        throw err;
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  async drill() {
    const last = this.newest();
    if (!last) throw new Error('There is no backup to test yet.');
    if (this.running) await this.running.catch(() => {});
    const r = await restoreDrill({ databaseUrl: this.databaseUrl, file: last.file });
    this.lastDrill = { at: new Date().toISOString(), ...r };
    this.log(r.ok
      ? `drill OK: ${last.name} restored, ${r.tables} tables, all row counts match`
      : `drill FAILED: ${last.name}: ${r.mismatches.map((m) => `${m.table} ${m.expected} -> ${m.restored}`).join(', ')}`);
    return r;
  }

  // Copies the newest backup (and its counts) to another folder, e.g. the
  // off-site USB drive (D15). Resolves the copied dump's path.
  copyNewest(destDir) {
    const last = this.newest();
    if (!last) throw new Error('There is no backup to copy yet.');
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, last.name);
    fs.copyFileSync(last.file, `${dest}.partial`);
    fs.copyFileSync(`${last.file}.counts.json`, `${dest}.counts.json`);
    fs.renameSync(`${dest}.partial`, dest);
    this.log(`backup copied to ${dest}`);
    return dest;
  }

  // For the status bar (lib/status.js).
  status() {
    const dir = this.getDir();
    const last = this.newest();
    return {
      dir,
      sameDrive: this.pgDataDir ? sameDrive(dir, this.pgDataDir) : false,
      lastBackupAt: last ? last.date.toISOString() : null,
      lastError: this.lastError,
    };
  }

  // The backup when FMS closes; give up after timeoutMs rather than hold
  // the shutdown (the previous backup is still there).
  async stop({ finalBackup = true, timeoutMs = 60_000 } = {}) {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    if (this.running) await this.running.catch(() => {});
    if (finalBackup) await this.run('shutdown', { timeoutMs }).catch(() => {});
  }
}

module.exports = { BackupScheduler, backupNow, restoreDrill, prune, listBackups, sameDrive };
