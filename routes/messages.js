const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Messages endpoint
router.post('/', verifyToken, async (req, res) => {
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

// Get provider's received messages
router.get('/provider', verifyToken, async (req, res) => {
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
router.post('/reply', verifyToken, async (req, res) => {
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

module.exports = router;