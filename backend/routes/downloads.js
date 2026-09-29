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

// Stable links for people: redirect to whatever installer latest.yml names.
// Prefer /latest: Cloudflare treats .exe URLs as static and stamps a 4-hour
// browser cache on them (overriding our no-cache), so a browser that opened
// /FMS-Setup.exe recently can keep getting the previous version's redirect.
// An extension-less path isn't cached at all.
router.get(['/latest', '/FMS-Setup.exe'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  let yml;
  try {
    yml = fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8');
  } catch {
    return res.status(404).send('No FMS release has been uploaded yet.');
  }
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
