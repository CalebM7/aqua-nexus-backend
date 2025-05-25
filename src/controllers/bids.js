// src/controllers/bids.js
const { pool } = require('../database/config');

// Submit a bid
const submitBid = async (req, res) => {
  const { project_id, amount, description } = req.body;
  const userId = req.user.userId;

  try {
    if (!project_id || !amount) {
      return res.status(400).json({ error: 'Missing project_id or amount' });
    }

    // Get provider's id (not user_id)
    const provider = await pool.query(
      'SELECT id FROM providers WHERE user_id = $1',
      [userId]
    );
    if (provider.rows.length === 0) {
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;

    if (description && (description.length < 50 || description.length > 500)) {
      return res
        .status(400)
        .json({ error: 'Description must be 50-500 characters' });
    }

    const bid = await pool.query(
      'INSERT INTO bids (project_id, provider_id, amount, description, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [project_id, providerId, amount, description || null]
    );

    const project = await pool.query(
      'SELECT user_id FROM projects WHERE id = $1',
      [project_id]
    );
    if (project.rows.length > 0) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, project_id) VALUES ($1, $2, $3)',
        [project.rows[0].user_id, 'bid', project_id]
      );
    }

    res.status(201).json(bid.rows[0]);
  } catch (err) {
    console.error('Error submitting bid:', err);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
};

// Get bids for a project
const getBidsByProject = async (req, res) => {
  const { project_id } = req.query;
  const userId = req.user.userId;

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  try {
    const project = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [project_id, userId]
    );
    if (project.rows.length === 0) {
      return res
        .status(403)
        .json({ error: 'Not authorized or project not found' });
    }

    const bids = await pool.query(
      `SELECT b.id, b.amount, b.description, b.status, b.created_at,
              p.name AS provider_name, p.rating, p.certifications
       FROM bids b
       JOIN providers p ON b.provider_id = p.id
       WHERE b.project_id = $1`,
      [project_id]
    );

    res.status(200).json(bids.rows);
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update bid status
const updateBidStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.userId;

  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const bid = await pool.query(
      `SELECT b.id, b.project_id
       FROM bids b
       JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (bid.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized or bid not found' });
    }

    const updatedBid = await pool.query(
      'UPDATE bids SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    res.status(200).json({
      message: `Bid ${status} successfully`,
      bid: updatedBid.rows[0],
    });
  } catch (error) {
    console.error('Error updating bid:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get provider's bids
const getProviderBids = async (req, res) => {
  const userId = req.user.userId;

  try {
    // Get provider's id (not user_id)
    const provider = await pool.query(
      'SELECT id FROM providers WHERE user_id = $1',
      [userId]
    );
    if (provider.rows.length === 0) {
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;

    const bids = await pool.query(
      `SELECT b.id, b.amount, b.description, b.status, b.created_at,
              pr.title, pr.budget
       FROM bids b
       JOIN projects pr ON b.project_id = pr.id
       WHERE b.provider_id = $1`,
      [providerId]
    );

    res.status(200).json(bids.rows);
  } catch (error) {
    console.error('Error fetching provider bids:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  submitBid,
  getBidsByProject,
  updateBidStatus,
  getProviderBids,
};
