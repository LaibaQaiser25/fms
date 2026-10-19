// Downloads the Windows programs the installer ships next to the app, into
// desktop/tools/ (packed by electron-builder, not committed):
//   pg_dump.exe, pg_restore.exe  factory backups (T2.5, D10). The embedded
//       Postgres has only initdb/pg_ctl/postgres (F7). These come from the
//       EDB binaries zip of the SAME version as the embedded server, and use
//       its DLLs (libpq, zlib, lz4, zstd, ssl): lib/backup.js runs them with
//       the embedded bin folder on PATH.
//   node.exe  runs host.js as a Windows service (T3.1/T3.2), so the service
//       needs no Electron (D4). The native modules (bcrypt, sharp) are N-API,
//       so the same node_modules work under it.
// Only the files needed are read out of the 300+ MB zip, with HTTP range
// requests. Every file is checked against a pinned SHA-256; a mismatch stops
// the build. Run by `npm run dist`; safe to re-run (skips good files).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PG_VERSION = '16.14'; // must match @embedded-postgres/windows-x64 (16.14.0-beta.17)
const PG_ZIP = `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-1-windows-x64-binaries.zip`;
const NODE_VERSION = 'v24.21.0'; // LTS; pinned hash = nodejs.org SHASUMS256.txt for win-x64/node.exe

const TOOLS = [
  { name: 'pg_dump.exe', zipEntry: 'pgsql/bin/pg_dump.exe', sha256: 'c354d7dff443eafc8c2f7141245ff86d40f094857bafee176e44c132a99b7495' },
  { name: 'pg_restore.exe', zipEntry: 'pgsql/bin/pg_restore.exe', sha256: '27a51e27253bc3e565127558136400608a62e392ca95b4858cbe7480fdda198c' },
  { name: 'node.exe', url: `https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`, sha256: 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32' },
];

const outDir = path.join(__dirname, '..', 'tools');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function get(url, range) {
  const res = await fetch(url, { headers: range ? { Range: `bytes=${range}` } : {} });
  if (res.status !== (range ? 206 : 200)) throw new Error(`${url}: HTTP ${res.status}${range ? ' (range request)' : ''}`);
  return Buffer.from(await res.arrayBuffer());
}

// Central directory of a remote zip (plain or zip64): name -> entry.
async function zipIndex(url) {
  const head = await fetch(url, { method: 'HEAD' });
  const size = Number(head.headers.get('content-length'));
  if (!size) throw new Error(`${url}: no content-length`);
  const tailLen = Math.min(size, 128 * 1024);
  const tail = await get(url, `${size - tailLen}-${size - 1}`);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
    const z64At = Number(tail.readBigUInt64LE(loc + 8)) - (size - tailLen);
    cdSize = Number(tail.readBigUInt64LE(z64At + 40));
    cdOffset = Number(tail.readBigUInt64LE(z64At + 48));
  }
  const cd = await get(url, `${cdOffset}-${cdOffset + cdSize - 1}`);
  const entries = new Map();
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
    const e = {
      method: cd.readUInt16LE(p + 10),
      crc: cd.readUInt32LE(p + 16),
      compSize: cd.readUInt32LE(p + 20),
      size: cd.readUInt32LE(p + 24),
      offset: cd.readUInt32LE(p + 42),
    };
    // zip64 extra field (id 1) holds whichever of these overflowed, in this order.
    const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    for (let q = 0; q + 4 <= extra.length;) {
      const id = extra.readUInt16LE(q);
      const len = extra.readUInt16LE(q + 2);
      if (id === 1) {
        let r = q + 4;
        for (const k of ['size', 'compSize', 'offset']) {
          if (e[k] === 0xffffffff) { e[k] = Number(extra.readBigUInt64LE(r)); r += 8; }
        }
      }
      q += 4 + len;
    }
    entries.set(name, e);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function zipEntry(url, entries, name) {
  const e = entries.get(name);
  if (!e) throw new Error(`${name} is not in ${url}`);
  const local = await get(url, `${e.offset}-${e.offset + 29}`);
  const dataAt = e.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  const raw = await get(url, `${dataAt}-${dataAt + e.compSize - 1}`);
  const data = e.method === 0 ? raw : e.method === 8 ? zlib.inflateRawSync(raw) : null;
  if (!data) throw new Error(`${name}: unsupported zip compression ${e.method}`);
  if (data.length !== e.size || (zlib.crc32 && zlib.crc32(data) !== e.crc)) throw new Error(`${name}: damaged download`);
  return data;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  let index = null;
  for (const tool of TOOLS) {
    const file = path.join(outDir, tool.name);
    if (fs.existsSync(file) && sha256(fs.readFileSync(file)) === tool.sha256) {
      console.log(`tools: ${tool.name} OK`);
      continue;
    }
    let data;
    if (tool.zipEntry) {
      index = index || await zipIndex(PG_ZIP);
      data = await zipEntry(PG_ZIP, index, tool.zipEntry);
    } else {
      data = await get(tool.url);
    }
    const got = sha256(data);
    if (got !== tool.sha256) {
      throw new Error(`${tool.name}: SHA-256 ${got} does not match the pinned ${tool.sha256 || '(none)'}. `
        + 'If the version was changed on purpose, check the file and pin the new hash in scripts/fetch-tools.js.');
    }
    fs.writeFileSync(file, data);
    console.log(`tools: ${tool.name} downloaded (${(data.length / 1e6).toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  console.error(`fetch-tools: ${err.message}`);
  process.exit(1);
});
