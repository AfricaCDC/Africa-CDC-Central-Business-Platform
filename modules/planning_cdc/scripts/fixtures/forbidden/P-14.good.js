const jwt = require('jsonwebtoken');
module.exports = jwt.verify('tok', process.env.JWT_ACCESS_SECRET);
