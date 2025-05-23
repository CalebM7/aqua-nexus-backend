const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("../database/config");

// -------- refresh token ----------
const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token provided' });
  }
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const tokenResult = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
      [userId, refreshToken]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(403).json({ error: 'Invalid refresh token' });
  }
};

// ------sign up -------
const signup = async (req, res) => {
  const { email, password, role, name, phone } = req.body;
  try {
    if (!email || !password || !role || (role === 'provider' && !name)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['user', 'provider'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, role, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, password_hash, role, phone]
    );
    const userId = userResult.rows[0].id;
    if (role === 'provider') {
      await pool.query(
        'INSERT INTO providers (user_id, name) VALUES ($1, $2)',
        [userId, name]
      );
    }
    const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, refreshToken, expiresAt]
    );
    res.status(201).json({ accessToken, refreshToken, userId, role });
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
};

// --------login --------------
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Calculate expiry date for refresh token (7 days from now)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Delete any existing refresh token for this user before inserting a new one
    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [user.id]
    );

    // Store refresh token in the database
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    // Build user object for response
    let userResponse = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    // If provider, add providerId
    if (user.role === "provider") {
      const providerResult = await pool.query(
        "SELECT id FROM providers WHERE user_id = $1",
        [user.id]
      );
      if (providerResult.rows.length > 0) {
        userResponse.providerId = providerResult.rows[0].id;
      }
    }

    res.json({ accessToken, refreshToken, user: userResponse });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
};

// -----------logout -----------
const logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'No refresh token provided' });
  }
  try {
    await pool.query(
      'DELETE FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Failed to logout' });
  }
};

// ---------- verify provider ------------
const verifyProvider = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*
      FROM providers p
      JOIN users u ON p.user_id = u.id
      WHERE u.role = 'provider'
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Providers error:', err.stack);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
};

// ------------verify a single provider -----------
const veirfySingleProvider = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT p.*
      FROM providers p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1 AND u.role = 'provider'
    `, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Provider error:', err.stack);
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
};

// ----------- me -------------
const me = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      userId: result.rows[0].id,
      email: result.rows[0].email,
      role: result.rows[0].role,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user info" });
  }
};

module.exports = {
  refreshToken,
  signup,
  login,
  logout,
  verifyProvider,
  veirfySingleProvider,
  me,
};
