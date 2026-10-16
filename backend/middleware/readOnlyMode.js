// READ_ONLY_MODE=true on the VPS once the factory desktop app is the single
// writer: its data then arrives only through /sync/ingest, and any write made
// here would be overwritten, or would take an id the factory later reuses.
// Mounted in server.js after /sync, before every other router.
const ALLOWED_WRITES = new Set(['/auth/login', '/auth/logout']);
// Offline Setup (T1.2, D7): the Owner's only writes on this server. Those
// routes sit behind authMiddleware + requireOwner, so this lets no one else in.
const ALLOWED_PREFIXES = ['/api/offline-setup/'];

const readOnlyMode = (req, res, next) => {
  if (process.env.READ_ONLY_MODE !== 'true') return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (ALLOWED_WRITES.has(req.path)) return next();
  if (ALLOWED_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  return res.status(403).json({
    error: 'This server is view-only. Enter data in the FMS app at the factory.',
    readOnly: true,
  });
};

module.exports = readOnlyMode;
