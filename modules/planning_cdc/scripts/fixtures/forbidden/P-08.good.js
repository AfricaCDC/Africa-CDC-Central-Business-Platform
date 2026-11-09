function fail(res) { return res.status(400).json({ success: false, message: 'bad', code: 'BAD_REQUEST' }); }
module.exports = fail;
