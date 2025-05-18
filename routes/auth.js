const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Signup endpoint
router.post('/signup', async (req, res) => {
  const { email, password, role, name, phone, service_type, description, price_range_min, price_range_max, service_areas, services } = req.body;
  try {
    console.log('Signup attempt:', { email, role });
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }
    if (!['user', 'provider'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (role === 'provider' && !name) {
      return res.status(400).json({ error: 'Name is required for providers' });
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    console.log('Inserting user:', email);
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, role, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
      [email, password_hash, role, phone]
    );
    const user = userResult.rows[0];

    let providerId = null;
    if (role === 'provider') {
      console.log('Inserting provider for user:', user.id);
      const providerResult = await pool.query(
        'INSERT INTO providers (user_id, name, service_type, description, price_range_min, price_range_max, service_areas, services, rating, reviews) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [user.id, name, service_type || 'rwh', description || 'No description available', price_range_min || null, price_range_max || null, service_areas || [], services || [], 0, 0]
      );
      providerId = providerResult.rows[0].id;
    }

    console.log('Generating tokens for user:', user.id);
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    console.log('Storing refresh token for user:', user.id);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3',
      [user.id, refreshToken, expiresAt]
    );

    console.log('Signup successful for user:', user.id);
    res.status(201).json({
      accessToken,
      refreshToken,
      user: { userId: user.id, email: user.email, role: user.role, providerId },
    });
  } catch (err) {
    console.error('Signup error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  console.log('Login attempt:', req.body);
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log('Querying users for email:', email);
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.log('User found:', { userId: user.id, email: user.email, role: user.role });

    console.log('Verifying password for user:', user.id);
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      console.log('Password mismatch for user:', user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.log('Password verified for user:', user.id);

    console.log('Generating tokens for user:', user.id);
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Storing refresh token for user:', user.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3',
      [user.id, refreshToken, expiresAt]
    );

    let providerId = null;
    if (user.role === 'provider') {
      console.log('Querying provider for user:', user.id);
      const providerResult = await pool.query('SELECT id FROM providers WHERE user_id = $1', [user.id]);
      if (providerResult.rows.length > 0) {
        providerId = providerResult.rows[0].id;
        console.log('Provider found:', providerId);
      } else {
        console.log('No provider found for user:', user.id);
      }
    }

    const responseData = {
      accessToken,
      refreshToken,
      user: { userId: user.id, email: user.email, role: user.role, providerId },
    };
    console.log('Login successful for user:', user.id, 'Response:', responseData);
    res.status(200).json(responseData);
  } catch (err) {
    console.error('Login error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Forgot password endpoint
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    console.log('Forgot password attempt for:', email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      console.log('Email not found:', email);
      return res.status(404).json({ error: 'Email not found' });
    }
    const userId = result.rows[0].id;
    const resetToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log(`Reset token for ${email}: ${resetToken}`);
    res.status(200).json({ message: 'Password reset link sent to your email' });
  } catch (err) {
    console.error('Forgot password error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Get provider ID by user ID
router.get('/provider-id/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;
  try {
    console.log('Fetching provider ID for user:', userId);
    const result = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      console.log('Provider not found for user:', userId);
      return res.status(404).json({ error: 'Provider not found for this user' });
    }
    res.json({ providerId: result.rows[0].id });
  } catch (err) {
    console.error('Provider ID fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch provider ID' });
  }
});

// Get current user info
router.get('/me', verifyToken, async (req, res) => {
  try {
    console.log('Auth/me request:', { userId: req.user.userId, token: req.headers['authorization'] });
    const userQuery = `
      SELECT u.id AS userId, u.email, u.role, p.id AS providerId
      FROM users u
      LEFT JOIN providers p ON u.id = p.user_id AND u.role = 'provider'
      WHERE u.id = $1
    `;
    const userResult = await pool.query(userQuery, [req.user.userId]);
    if (userResult.rows.length === 0) {
      console.log('User not found for ID:', req.user.userId);
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userResult.rows[0];
    console.log('Auth/me response:', userData);
    res.json(userData);
  } catch (err) {
    console.error('Auth/me error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token not provided' });
  }
  try {
    console.log('Refresh token attempt');
    const tokenResult = await pool.query(
      'SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );
    if (tokenResult.rows.length === 0) {
      console.log('Invalid refresh token');
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    const storedToken = tokenResult.rows[0];
    if (new Date(storedToken.expires_at) < new Date()) {
      console.log('Refresh token expired for user:', storedToken.user_id);
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      return res.status(403).json({ error: 'Refresh token expired' });
    }
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [payload.userId]);
    if (userResult.rows.length === 0) {
      console.log('User not found for refresh token');
      return res.status(404).json({ error: 'User not found for refresh token' });
    }
    const userRole = userResult.rows[0].role;
    const newAccessToken = jwt.sign(
      { userId: payload.userId, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    console.log('Token refreshed for user:', payload.userId);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('Refresh token error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    console.log('Logout failed: No refresh token provided');
    return res.status(400).json({ error: 'No refresh token provided' });
  }
  try {
    console.log('Logout: Deleting refresh token');
    const result = await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    if (result.rowCount === 0) {
      console.log('Logout: No matching refresh token found');
    } else {
      console.log('Logout: Refresh token deleted');
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
    });
    res.status(500).json({ error: 'Failed to logout' });
  }
});

module.exports = router;