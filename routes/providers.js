const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Get all providers
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all providers');
    const result = await pool.query(`
      SELECT p.id, p.name, p.service_type, p.description, p.price_range_min, 
             p.price_range_max, p.service_areas, p.services, p.rating, p.reviews
      FROM providers p
    `);
    console.log('Providers fetched:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch providers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Get provider by ID
router.get('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Fetching provider by ID:', id);
    const result = await pool.query(`
      SELECT p.id, p.name, p.service_type, p.description, p.price_range_min, 
             p.price_range_max, p.service_areas, p.services, p.rating, p.reviews
      FROM providers p
      WHERE p.id = $1
    `, [id]);
    if (result.rows.length === 0) {
      console.log('Provider not found for ID:', id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider fetched:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch provider error:', err.message);
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
});

// Update provider profile
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { description, service_type, price_range_min, price_range_max, service_areas, services } = req.body;
  try {
    console.log('Updating provider:', id);
    const result = await pool.query(`
      UPDATE providers
      SET description = $1, service_type = $2, price_range_min = $3, 
          price_range_max = $4, service_areas = $5, services = $6
      WHERE id = $7
      RETURNING *
    `, [description, service_type, price_range_min, price_range_max, service_areas, services, id]);
    if (result.rows.length === 0) {
      console.log('Provider not found for update:', id);
      return res.status(404).json({ error: 'Provider not found' });
    }
    console.log('Provider updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update provider error:', err.message);
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

// Upload provider image
router.post('/:id/image', verifyToken, async (req, res) => {
  // Implement image upload logic (e.g., using multer)
  console.log('Image upload not implemented for provider:', req.params.id);
  res.status(501).json({ error: 'Image upload not implemented' });
});

module.exports = router;