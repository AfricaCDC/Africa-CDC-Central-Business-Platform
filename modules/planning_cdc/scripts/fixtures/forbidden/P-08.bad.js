function fail(res) { return res.status(400).json({ error: 'bad' }); }
module.exports = fail;
