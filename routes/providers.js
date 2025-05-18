const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();
const upload = multer({ dest: 'public/images/' });

// Providers endpoint
router.get('/', verifyToken, async (req, res) => {
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
router.get('/:id', verifyToken, async (req, res) => {
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
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { description, service_type, price_range_min, price_range_max, service_areas, services } = req.body;
  const userId = req.user.userId;
  try {
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

    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1 AND id = $2', [userId, id]);
    if (provider.rows.length === 0) {
      console.log('Unauthorized or provider not found:', { userId, providerId: id });
      return res.status(403).json({ error: 'Unauthorized or provider not found' });
    }

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
    if (err.code === '42703') {
      return res.status(500).json({ error: 'Database schema error: missing column' });
    }
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid data format for service_areas or services' });
    }
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

// Upload provider image
router.post('/:id/image', verifyToken, upload.single('image'), async (req, res) => {
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

module.exports = router;