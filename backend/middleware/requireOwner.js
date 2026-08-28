// First role-gated route in this codebase — every other /api/* route only
// requires a valid JWT (see authMiddleware.js). req.user.role is always the
// canonical 'Owner'/'Manager' capitalization (set at register/login time).
const requireOwner = (req, res, next) => {
  if (req.user?.role !== 'Owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
};

module.exports = requireOwner;
