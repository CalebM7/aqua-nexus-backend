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
// For handling file uploads
const multer = require('multer');
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

// Configure multer for image uploads
const upload = multer({ dest: 'public/images/' });

// PostgreSQL connection with enhanced configuration
const pool = new Pool({
  connectionString: process.env.DB_STRING,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
  max: 20, // Maximum number of clients in the pool
  allowExitOnIdle: false, // Prevent pool from exiting on idle
});

// Handle pool errors and attempt reconnection
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err.message);
  // Do not attempt reconnection here; handle it in initializeDatabase
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Async function to initialize database with reconnection logic
const initializeDatabase = async () => {
  const maxRetries = 5;
  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      console.log(`Attempt ${attempt} to connect to database...`);
      // Test database connection
      const connection = await pool.query('SELECT NOW()');
      console.log('✅ Database connected at:', connection.rows[0].now);

      // Enable PostGIS extension
      await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
      const postgisCheck = await pool.query('SELECT postgis_version()');
      console.log('✅ PostGIS enabled:', postgisCheck.rows[0].postgis_version);

      // Create tables
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
      console.log('✅ Users table created');

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
      console.log('✅ Providers table created');

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
          provider_id INT REFERENCES providers(id),
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Projects table created');

      console.log('Creating bids table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bids (
          id SERIAL PRIMARY KEY,
          project_id INT REFERENCES projects(id),
          provider_id INT REFERENCES providers(id),
          amount NUMERIC NOT NULL,
          description TEXT,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Bids table created');

      console.log('Creating reviews table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          provider_id INT REFERENCES providers(id),
          user_id INT REFERENCES users(id),
          rating INT CHECK (rating BETWEEN 1 AND 5),
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Reviews table created');

      console.log('Creating gallery_images table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS gallery_images (
          id SERIAL PRIMARY KEY,
          provider_id INT REFERENCES providers(id),
          image_url TEXT NOT NULL,
          caption TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Gallery_images table created');

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
      console.log('✅ Messages table created');

      console.log('Creating refresh_tokens table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Refresh_tokens table created');

      console.log('✅ Tables created successfully');
      break; // Exit loop on success
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed:`, {
        message: err.message,
        code: err.code,
        detail: err.detail,
        stack: err.stack,
      });
      if (attempt === maxRetries) {
        console.error('❌ Max retries reached. Database initialization failed.');
        process.exit(1);
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
    console.error('Database query error:', err.message);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Signup endpoint
app.post('/auth/signup', async (req, res) => {
  const { email, password, role, name, phone, service_type, description, price_range_min, price_range_max, service_areas, services } = req.body;
  try {
    // Validate input
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

    // Hash password
    console.log('Hashing password for:', email);
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user
    console.log('Inserting user:', email);
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, role, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
      [email, password_hash, role, phone]
    );
    const user = userResult.rows[0];

    // If provider, insert into providers table
    let providerId = null;
    if (role === 'provider') {
      console.log('Inserting provider for user:', user.id);
      const providerResult = await pool.query(
        'INSERT INTO providers (user_id, name, service_type, description, price_range_min, price_range_max, service_areas, services, rating, reviews) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [user.id, name, service_type || 'rwh', description || 'No description available', price_range_min || null, price_range_max || null, service_areas || [], services || [], 0, 0]
      );
      providerId = providerResult.rows[0].id;
    }

    // Generate JWT tokens
    console.log('Generating tokens for user:', user.id);
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Calculate expiry date for refresh token (7 days from now)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Store refresh token in the database
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
    if (err.code === '23505') { // Unique violation (duplicate email)
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  console.log('Login attempt:', req.body);
  const { email, password } = req.body;
  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check user in database
    console.log('Querying users for email:', email);
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.log('User found:', { userId: user.id, email: user.email, role: user.role });

    // Verify password
    console.log('Verifying password for user:', user.id);
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      console.log('Password mismatch for user:', user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.log('Password verified for user:', user.id);

    // Generate JWT token
    console.log('Generating tokens for user:', user.id);
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token
    console.log('Storing refresh token for user:', user.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3',
      [user.id, refreshToken, expiresAt]
    );

    // Get providerId
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

    // Send response
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
app.post('/auth/forgot-password', async (req, res) => {
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
    // Placeholder: In production, send email with resetToken (e.g., via Nodemailer)
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
app.get('/auth/provider-id/:userId', verifyToken, async (req, res) => {
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
app.get('/auth/me', verifyToken, async (req, res) => {
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
app.post('/auth/refresh', async (req, res) => {
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
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [storedToken.user_id]);
    if (userResult.rows.length === 0) {
      console.log('User not found for refresh token');
      return res.status(404).json({ error: 'User not found for refresh token' });
    }
    const userRole = userResult.rows[0].role;
    const newAccessToken = jwt.sign(
      { userId: storedToken.user_id, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    console.log('Token refreshed for user:', storedToken.user_id);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('Refresh token error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Server error during token refresh' });
  }
});

// Logout endpoint
app.post('/auth/logout', async (req, res) => {
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

// Providers endpoint
app.get('/providers', verifyToken, async (req, res) => {
  try {
    console.log('Fetching all providers');
    const result = await pool.query(`
      SELECT p.*
      FROM providers p
      JOIN users u ON p.user_id = u.id
      WHERE u.role = 'provider'
    `);
    console.log('Providers fetched:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Providers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Provider by ID endpoint
app.get('/provider/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Fetching provider:', id);
    const result = await pool.query(`
      SELECT p.*
      FROM providers p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1 AND u.role = 'provider'
    `, [id]);
    if (result.rows.length === 0) {
      console.log('Provider not found:', id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider fetched:', result.rows[0].id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Provider error:', err.message);
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
});

// Update provider profile
app.put('/provider/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { description, service_type, price_range_min, price_range_max, service_areas, services } = req.body;
  const userId = req.user.userId;
  try {
    // Validate input
    console.log('Updating provider:', id, 'by user:', userId);
    if (!description || !service_type || !price_range_min || !price_range_max || !service_areas || !services) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['rwh', 'borehole'].includes(service_type)) {
      console.log('Invalid service_type:', service_type);
      return res.status(400).json({ error: 'Invalid service_type, must be "rwh" or "borehole"' });
    }
    if (!Array.isArray(service_areas) || !Array.isArray(services)) {
      console.log('Invalid service_areas or services format');
      return res.status(400).json({ error: 'service_areas and services must be arrays' });
    }

    // Check authorization
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1 AND id = $2', [userId, id]);
    if (provider.rows.length === 0) {
      console.log('Unauthorized or provider not found:', { userId, providerId: id });
      return res.status(403).json({ error: 'Unauthorized or provider not found' });
    }

    // Update provider
    const result = await pool.query(
      `UPDATE providers
       SET description = $1,
           service_type = $2,
           price_range_min = $3,
           price_range_max = $4,
           service_areas = $5::TEXT[],
           services = $6::TEXT[]
       WHERE id = $7
       RETURNING *`,
      [description, service_type, price_range_min, price_range_max, service_areas, services, id]
    );

    if (result.rows.length === 0) {
      console.log('Provider not found for update:', id);
      return res.status(404).json({ error: 'Provider not found' });
    }

    console.log('Provider updated:', result.rows[0].id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update provider error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    if (err.code === '42703') { // Column does not exist
      return res.status(500).json({ error: 'Database schema error: missing column' });
    }
    if (err.code === '22P02') { // Invalid text representation (e.g., wrong data type)
      return res.status(400).json({ error: 'Invalid data format for service_areas or services' });
    }
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

// Upload provider image
app.post('/provider/:id/image', verifyToken, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  try {
    console.log('Uploading image for provider:', id, 'by user:', userId);
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1 AND id = $2', [userId, id]);
    if (provider.rows.length === 0) {
      console.log('Unauthorized or provider not found:', { userId, providerId: id });
      return res.status(403).json({ error: 'Unauthorized or provider not found' });
    }
    const imagePath = `/images/${req.file.filename}`;
    const result = await pool.query(
      'UPDATE providers SET image = $1 WHERE id = $2 RETURNING *',
      [imagePath, id]
    );
    console.log('Image uploaded for provider:', id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Image upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Submit a review
app.post('/reviews', verifyToken, async (req, res) => {
  const { provider_id, rating, comment } = req.body;
  const userId = req.user.userId;
  try {
    console.log('Submitting review for provider:', provider_id, 'by user:', userId);
    if (!provider_id || !rating || rating < 1 || rating > 5) {
      console.log('Invalid provider_id or rating:', { provider_id, rating });
      return res.status(400).json({ error: 'Invalid provider_id or rating' });
    }
    const review = await pool.query(
      'INSERT INTO reviews (provider_id, user_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [provider_id, userId, rating, comment || null]
    );
    const ratings = await pool.query(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE provider_id = $1',
      [provider_id]
    );
    await pool.query(
      'UPDATE providers SET rating = $1, reviews = $2 WHERE id = $3',
      [ratings.rows[0].avg_rating, ratings.rows[0].review_count, provider_id]
    );
    console.log('Review submitted for provider:', provider_id);
    res.status(201).json(review.rows[0]);
  } catch (err) {
    console.error('Review error:', err.message);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// Messages endpoint
app.post('/messages', verifyToken, async (req, res) => {
  const { providerId, content } = req.body;
  const senderId = req.user.userId;
  try {
    console.log('Sending message from user:', senderId, 'to provider:', providerId);
    if (!providerId || !content) {
      console.log('Missing providerId or content');
      return res.status(400).json({ error: 'Missing providerId or content' });
    }
    const result = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
      [senderId, providerId, content]
    );
    console.log('Message sent:', result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Message error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get provider's projects
app.get('/projects', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('Fetching projects for user:', userId);
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId]);
    if (provider.rows.length === 0) {
      console.log('User is not a provider:', userId);
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;
    const result = await pool.query(
      'SELECT p.*, u.email AS user_email FROM projects p JOIN users u ON p.user_id = u.id WHERE p.status = $1',
      ['pending']
    );
    console.log('Projects fetched:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Projects error:', err.message);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get provider's received messages
app.get('/messages/provider', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('Fetching messages for provider user:', userId);
    const result = await pool.query(
      'SELECT m.*, u.email AS sender_email, p.title AS project_title ' +
      'FROM messages m ' +
      'JOIN users u ON m.sender_id = u.id ' +
      'LEFT JOIN projects p ON m.project_id = p.id ' +
      'WHERE m.receiver_id = $1 AND m.sender_id != m.receiver_id ' +
      'ORDER BY m.created_at DESC',
      [userId]
    );
    console.log('Messages fetched:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Messages error:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Reply to a message
app.post('/messages/reply', verifyToken, async (req, res) => {
  const { content, receiver_id, project_id } = req.body;
  const sender_id = req.user.userId;
  try {
    console.log('Replying from user:', sender_id, 'to user:', receiver_id);
    if (!content || !receiver_id) {
      console.log('Missing content or receiver_id');
      return res.status(400).json({ error: 'Missing content or receiver_id' });
    }
    const message = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, project_id, content, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [sender_id, receiver_id, project_id || null, content]
    );
    console.log('Reply sent:', message.rows[0].id);
    res.status(201).json(message.rows[0]);
  } catch (err) {
    console.error('Reply error:', err.message);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// Submit a bid
app.post('/bids', verifyToken, async (req, res) => {
  const { project_id, amount, description } = req.body;
  const userId = req.user.userId;
  try {
    console.log('Submitting bid for project:', project_id, 'by user:', userId);
    if (!project_id || !amount) {
      console.log('Missing project_id or amount');
      return res.status(400).json({ error: 'Missing project_id or amount' });
    }
    // Get provider_id from providers table
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId]);
    if (provider.rows.length === 0) {
      console.log('User is not a provider:', userId);
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;
    const bid = await pool.query(
      'INSERT INTO bids (project_id, provider_id, amount, description, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [project_id, providerId, amount, description || null]
    );
    console.log('Bid submitted:', bid.rows[0].id);
    res.json(bid.rows[0]);
  } catch (err) {
    console.error('Bid error:', err.message);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

// Initialize database
initializeDatabase();