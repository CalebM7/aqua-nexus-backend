const { pool } = require('../database/config');

// Send a message to a provider or user
const messagesFunc = async (req, res) => {
  let { providerId, receiver_id, content } = req.body;
  const senderId = req.user.userId;
  try {
    if (!content) {
      return res.status(400).json({ error: 'Missing content' });
    }
    // If receiver_id is not provided but providerId is, look up user_id
    if (!receiver_id && providerId) {
      const providerRes = await pool.query(
        'SELECT user_id FROM providers WHERE id = $1',
        [providerId]
      );
      if (providerRes.rows.length === 0) {
        return res.status(400).json({ error: 'Provider not found' });
      }
      receiver_id = providerRes.rows[0].user_id;
    }
    if (!receiver_id) {
      return res.status(400).json({ error: 'Missing receiver_id' });
    }
    const result = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
      [senderId, receiver_id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Get messages for provider dashboard
const getProviderMessages = async (req, res) => {
  const userId = req.user.userId;
  try {
    // Find provider id for this user
    const provider = await pool.query(
      'SELECT id FROM providers WHERE user_id = $1',
      [userId]
    );
    if (provider.rows.length === 0) {
      return res.status(403).json({ error: 'User is not a provider' });
    }
    const providerId = provider.rows[0].id;
    // Get messages where receiver_id is this provider's user_id
    const result = await pool.query(
      `SELECT m.*, u.email AS sender_email, p.title AS project_title
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE m.receiver_id = $1
       ORDER BY m.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// Get messages for user dashboard
const getUserMessages = async (req, res) => {
  const userId = req.user.userId;
  try {
    // Get messages where receiver_id is this user
    const result = await pool.query(
      `SELECT m.*, u.email AS sender_email, p.title AS project_title
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE m.receiver_id = $1
       ORDER BY m.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// Reply to a message
const replyMessage = async (req, res) => {
  const { content, receiver_id, project_id } = req.body;
  const senderId = req.user.userId;
  try {
    if (!content || !receiver_id) {
      return res.status(400).json({ error: 'Missing content or receiver_id' });
    }
    const result = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, project_id, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [senderId, receiver_id, project_id || null, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send reply' });
  }
};

module.exports = {
  messagesFunc,
  getProviderMessages,
  getUserMessages,
  replyMessage,
};
