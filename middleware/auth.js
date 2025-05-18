const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  console.log('Auth header:', authHeader || 'None');
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.log('No token provided in request');
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    console.log('Verifying token:', token.slice(0, 10) + '...');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = verifyToken;