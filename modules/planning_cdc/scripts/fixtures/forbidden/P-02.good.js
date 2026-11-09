const rbacService = require('./rbacService');
async function handler(req, res) {
  const { allowed } = await rbacService.checkPermission(req.user.id, 'x', 'read');
  if (!allowed) return res.status(403).json({ success: false, message: 'nope', code: 'FORBIDDEN' });
  return res.json({ success: true, data: {} });
}
module.exports = handler;
