const { pool } = require("../database/config");

// Post a project
const postProject = async (req, res) => {
  const { title, description, service_type, budget, location, permit_required } = req.body;
  const userId = req.user.userId;
  try {
    if (!title || budget <= 0 || !['rwh', 'borehole'].includes(service_type)) {
      return res.status(400).json({ error: 'Invalid input: title, positive budget, and valid service_type (rwh or borehole) required' });
    }
    if (location && (typeof location.lat !== 'number' || typeof location.long !== 'number')) {
      return res.status(400).json({ error: 'Invalid location format: lat and long must be numbers' });
    }
    if (req.user.role !== 'user') {
      return res.status(403).json({ error: 'Only users can post projects' });
    }
    const result = await pool.query(
      `INSERT INTO projects (user_id, title, description, service_type, budget, location, permit_required, status, created_at)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, 'pending', NOW())
       RETURNING id, user_id, title, description, service_type, budget, ST_X(location) AS long, ST_Y(location) AS lat, permit_required, status, created_at`,
      [
        userId,
        title,
        description || null,
        service_type,
        budget,
        location ? location.long : null,
        location ? location.lat : null,
        permit_required || false,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to post project' });
  }
};

// Get user's projects
const getMyProjects = async (req, res) => {
  const userId = req.user.userId;
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ error: 'Only users can view their projects' });
    }
    const result = await pool.query(
      `SELECT id, title, description, service_type, budget,
              ST_X(location) AS long, ST_Y(location) AS lat,
              permit_required, status, created_at
       FROM projects
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Get provider's projects (pending)
const getProviderProjects = async (req, res) => {
  try {
    const userId = req.user.userId;
    const provider = await pool.query('SELECT id FROM providers WHERE user_id = $1', [userId]);
    if (provider.rows.length === 0) {
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;
    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.service_type, p.budget,
              ST_X(location) AS long, ST_Y(location) AS lat,
              p.permit_required, p.status, p.created_at,
              u.email AS user_email
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.status = $1`,
      ['pending']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

module.exports = {
  postProject,
  getMyProjects,
  getProviderProjects,
};
