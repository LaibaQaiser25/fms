// Copies the backend source and a desktop build of the frontend into
// desktop/staged/, which is what main.js runs and what electron-builder packs.
//   staged/backend   <- ../backend (minus node_modules, .env, Docker files)
//   staged/frontend  <- vite build of ../frontend pointed at the local server
// Backend deps are NOT copied: they resolve from desktop/node_modules, so every
// backend dependency must also be listed in desktop/package.json (checked below).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { APP_PORT } = require('../lib/ports');

const root = path.resolve(__dirname, '..', '..');
const desktopDir = path.join(root, 'desktop');
const stagedDir = path.join(desktopDir, 'staged');
const backendSrc = path.join(root, 'backend');
const frontendSrc = path.join(root, 'frontend');

const backendPkg = require(path.join(backendSrc, 'package.json'));
const desktopPkg = require(path.join(desktopDir, 'package.json'));
const missing = Object.keys(backendPkg.dependencies || {})
  .filter((dep) => !(desktopPkg.dependencies || {})[dep]);
if (missing.length) {
  console.error(`desktop/package.json is missing backend dependencies: ${missing.join(', ')}`);
  console.error('Add them (same versions as backend/package.json) and npm install in desktop/.');
  process.exit(1);
}

fs.rmSync(stagedDir, { recursive: true, force: true });

const SKIP = new Set(['node_modules', '.env', 'Dockerfile', '.dockerignore']);
fs.cpSync(backendSrc, path.join(stagedDir, 'backend'), {
  recursive: true,
  filter: (src) => !SKIP.has(path.basename(src)),
});
console.log('staged backend');

// 127.0.0.1 rather than localhost: config.js compares window.location.hostname
// against VITE_APP_URL to decide this is the dashboard (so "/" -> /login).
const origin = `http://127.0.0.1:${APP_PORT}`;
execSync(
  `npx vite build --outDir "${path.join(stagedDir, 'frontend')}" --emptyOutDir`,
  {
    cwd: frontendSrc,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: `${origin}/api`, VITE_APP_URL: origin },
  }
);
console.log('staged frontend');
