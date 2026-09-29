const express = require('express');
const fs = require('fs');
const path = require('path');

// Factory desktop app installer + auto-update files, served from DOWNLOADS_DIR
// (~/fms/downloads on the VPS, bind-mounted read-only by docker-compose.yml).
// Each release uploads three files there (see desktop/README.md):
//   FMS-Setup-<version>.exe, FMS-Setup-<version>.exe.blockmap, latest.yml
// electron-updater in the installed app polls latest.yml. Public on purpose:
// the installer holds no secrets (the sync key is typed in at setup).
const router = express.Router();
const dir = process.env.DOWNLOADS_DIR;

function readLatest() {
  try {
    return fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8');
  } catch {
    return null;
  }
}

// Install guide page (views/download.html) — the link to hand out. Version,
// size and date come from latest.yml, so each upload updates the page too.
const pageTemplate = fs.readFileSync(path.join(__dirname, '..', 'views', 'download.html'), 'utf8');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

router.get('/', (req, res) => {
  const yml = readLatest();
  const field = (re) => yml?.match(re)?.[1].trim().replace(/^'|'$/g, '');
  const version = field(/^version:\s*(.+)$/m);
  const size = Number(field(/^\s+size:\s*(\d+)$/m));
  const date = field(/^releaseDate:\s*(.+)$/m);

  const values = {
    VERSION: version || '—',
    SIZE: size ? `${Math.round(size / 1024 / 1024)} MB` : '—',
    DATE: date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }) : '—',
    BUTTON: version ? 'Download for Windows' : 'Not available yet',
    DISABLED: version ? '' : 'aria-disabled="true"',
  };
  const html = pageTemplate.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    key === 'DISABLED' ? values.DISABLED : escapeHtml(values[key] ?? m));
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

// Stable links for people: redirect to whatever installer latest.yml names.
// Prefer /latest: Cloudflare treats .exe URLs as static and stamps a 4-hour
// browser cache on them (overriding our no-cache), so a browser that opened
// /FMS-Setup.exe recently can keep getting the previous version's redirect.
// An extension-less path isn't cached at all.
router.get(['/latest', '/FMS-Setup.exe'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const yml = readLatest();
  if (!yml) return res.status(404).send('No FMS release has been uploaded yet.');
  const file = yml.match(/^path:\s*(.+)$/m)?.[1].trim();
  if (!file) return res.status(500).send('latest.yml has no path');
  res.redirect(302, `${req.baseUrl}/${encodeURIComponent(file)}`);
});

// no-cache: Cloudflare caches .exe by default, which would keep handing out
// an old installer (and latest.yml must always be fresh for updates).
router.use(express.static(dir, {
  index: false,
  dotfiles: 'deny',
  setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
}));

module.exports = router;
