// Framework for building REST APIs.
const express = require('express');
// PostgreSQL client for Node.js.
const { Pool } = require('pg');
// Securely loads credentials from .env (never commit this!).
const dotenv = require('dotenv');
// For password hashing
const bcrypt = require('bcrypt');
// For JWT authentication
const jwt = require('jsonwebtoken');
const cors = require('cors');
// Add this for path handling
const path = require('path'); 

dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Serve static files from public/images
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DB_STRING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000 // 30 seconds
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Async function to initialize database
const initializeDatabase = async () => {
  const maxRetries = 3;
  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      console.log(`Attempt ${attempt} to connect to database...`);
      // 1. Test database connection
      const connection = await pool.query('SELECT NOW()');
      console.log('✅ Database connected at:', connection.rows[0].now);

      // 2. Enable PostGIS extension
      await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
      const postgisCheck = await pool.query('SELECT postgis_version()');
      console.log('✅ PostGIS enabled:', postgisCheck.rows[0].postgis_version);

      // 3. Create tables
      console.log('Creating users table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(20) CHECK (role IN ('user', 'provider', 'admin')),
          phone VARCHAR(20),
          created_at TIMESTAMP DEFAULT NOW()
        )`);

      console.log('Creating projects table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          service_type VARCHAR(50) CHECK (service_type IN ('rwh', 'borehole')),
          location GEOMETRY(POINT, 4326),
          budget NUMERIC,
          created_at TIMESTAMP DEFAULT NOW()
        )`);

      console.log('Creating bids table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bids (
          id SERIAL PRIMARY KEY,
          project_id INT REFERENCES projects(id),
          provider_id INT REFERENCES users(id),
          amount NUMERIC NOT NULL,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
          created_at TIMESTAMP DEFAULT NOW()
        )`);

      console.log('Creating providers table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS providers (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id),
          name VARCHAR(255) NOT NULL,
          certifications JSONB,
          services JSONB,
          rating NUMERIC,
          location GEOMETRY(POINT, 4326),
          created_at TIMESTAMP DEFAULT NOW(),
          service_type VARCHAR(50) CHECK (service_type IN ('rwh', 'borehole')),
          license_number VARCHAR(100),
          service_areas TEXT[],
          description TEXT,
          image TEXT,
          price_range_min INTEGER,
          price_range_max INTEGER,
          reviews INTEGER DEFAULT 0,
          UNIQUE(user_id)
        )`);

      console.log('Creating reviews table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          provider_id INT REFERENCES users(id),
          user_id INT REFERENCES users(id),
          rating INT CHECK (rating BETWEEN 1 AND 5),
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`);

      console.log('Creating gallery_images table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS gallery_images (
          id SERIAL PRIMARY KEY,
          provider_id INT REFERENCES users(id),
          image_url TEXT NOT NULL,
          caption TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`);

      console.log('Creating messages table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          sender_id INT REFERENCES users(id),
          receiver_id INT REFERENCES users(id),
          project_id INT REFERENCES projects(id) NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`);

      console.log('Creating refresh_tokens table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id),
          token TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, token)
        )`);

      console.log('✅ Tables created successfully');
      break; // Exit loop on success
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed:`, err);
      if (attempt === maxRetries) {
        console.error('❌ Max retries reached. Database initialization failed.');
        return;
      }
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
  }
};

// Basic route
app.get('/', (req, res) => {
  console.log('Handling GET / request');
  res.send('AquaNexus Backend is Running 🚀');
});

// Test database route
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected', time: result.rows[0].now });
  } catch (err) {
    console.error('Database query error:', err.stack);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Signup endpoint
app.post('/auth/signup', async (req, res) => {
  const { email, password, role, name, phone } = req.body;
  try {
    // Validate input
    if (!email || !password || !role || (role === 'provider' && !name)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['user', 'provider'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, role, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, password_hash, role, phone]
    );
    const userId = userResult.rows[0].id;

    // If provider, insert into providers table
    if (role === 'provider') {
      await pool.query(
        'INSERT INTO providers (user_id, name) VALUES ($1, $2)',
        [userId, name]
      );
    }

    // Generate JWT token
    const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Calculate expiry date for refresh token (7 days from now)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Store refresh token in the database
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, refreshToken, expiresAt]
    );

    res.status(201).json({ accessToken, refreshToken, userId, role });
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === '23505') { // Unique violation (duplicate email)
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
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

    // Store refresh token in the database
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    res.json({ accessToken, refreshToken, userId: user.id, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user info
app.get('/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [req.user.userId]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(user.rows[0]);
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Refresh token endpoint
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token provided' });
  }
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Check if refresh token exists in the database and is valid
    const tokenResult = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
      [userId, refreshToken]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    // Fetch user
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token
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
});

// Logout endpoint
app.post('/auth/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'No refresh token provided' });
  }
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// Providers endpoint
app.get('/providers', verifyToken, async (req, res) => {
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
});

// Provider by ID endpoint
app.get('/provider/:id', verifyToken, async (req, res) => {
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
});

// Messages endpoint
app.post('/messages', verifyToken, async (req, res) => {
  const { providerId, content } = req.body;
  const senderId = req.user.userId;
  try {
    if (!providerId || !content) {
      return res.status(400).json({ error: 'Missing providerId or content' });
    }
    const result = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
      [senderId, providerId, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get provider's projects
app.get('/projects', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId; // Use req.user.userId from verifyToken
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId]);
    if (provider.rows.length === 0) {
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;
    const result = await pool.query(
      'SELECT p.*, u.email AS user_email FROM projects p JOIN users u ON p.user_id = u.id WHERE p.provider_id = $1',
      [providerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get provider's received messages
app.get('/messages/provider', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId; // Use req.user.userId from verifyToken
    const result = await pool.query(
      'SELECT m.*, u.email AS sender_email, p.title AS project_title ' +
      'FROM messages m ' +
      'JOIN users u ON m.sender_id = u.id ' +
      'LEFT JOIN projects p ON m.project_id = p.id ' +
      'WHERE m.receiver_id = $1',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

// Initialize database
initializeDatabase();