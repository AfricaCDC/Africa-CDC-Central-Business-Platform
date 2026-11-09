function handler(req, res) {
  if (hasAnyRole(req.user, ['ADMIN'])) return res.json({ ok: true });
  return res.status(403).json({ success: false, message: 'nope', code: 'FORBIDDEN' });
}
module.exports = handler;
