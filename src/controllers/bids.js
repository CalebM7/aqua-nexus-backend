const { pool } = require("../database/config");

// Submit a bid
const submitBid = async (req, res) => {
  const { project_id, amount, description } = req.body;
  const userId = req.user.userId;
  try {
    if (!project_id || !amount) {
      return res.status(400).json({ error: 'Missing project_id or amount' });
    }
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId]);
    if (provider.rows.length === 0) {
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;
    const bid = await pool.query(
      'INSERT INTO bids (project_id, provider_id, amount, description, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [project_id, providerId, amount, description || null]
    );
    res.json(bid.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit bid' });
  }
};

module.exports = { submitBid };
