const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const initializeDatabase = require('./db/init');
const authRoutes = require('./routes/auth');
const providerRoutes = require('./routes/providers');
const projectRoutes = require('./routes/projects');
const bidRoutes = require('./routes/bids');
const reviewRoutes = require('./routes/reviews');
const messageRoutes = require('./routes/messages');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Routes
app.get('/', (req, res) => {
  console.log('Handling GET / request');
  res.send('AquaNexus Backend is Running 🚀');
});

app.get('/api/test-db', async (req, res) => {
  try {
    const pool = require('./db/pool');
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected', time: result.rows[0].now });
  } catch (err) {
    console.error('Database query error:', err.message);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.use('/auth', authRoutes);
app.use('/providers', providerRoutes);
app.use('/projects', projectRoutes);
app.use('/bids', bidRoutes);
app.use('/reviews', reviewRoutes);
app.use('/messages', messageRoutes);

// Catch-all for unhandled routes
app.use((req, res) => {
  console.log('Unhandled route:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  initializeDatabase();
});