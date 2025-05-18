const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Submit a bid
router.post('/', verifyToken, async (req, res) => {
  const { project_id, amount, description } = req.body;
  const userId = req.user.userId;
  try {
    console.log('Submitting bid for project:', project_id, 'by user:', userId);
    if (!project_id || !amount) {
      console.log('Missing project_id or amount');
      return res.status(400).json({ error: 'Missing project_id or amount' });
    }
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

module.exports = router;