const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Send message
router.post('/reply', verifyToken, async (req, res) => {
  const { content, receiver_id, project_id } = req.body;
  const sender_id = req.user.userId;
  try {
    console.log('Sending message from:', sender_id, 'to:', receiver_id);
    if (!content || !receiver_id) {
      return res
        .status(400)
        .json({ error: 'Content and receiver_id are required' });
    }
    const result = await pool.query(
      `
      INSERT INTO messages (sender_id, receiver_id, content, project_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [sender_id, receiver_id, content, project_id || null]
    );
    console.log('Message sent:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Send message error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get provider messages
router.get('/provider', verifyToken, async (req, res) => {
  const providerUserId = req.user.userId;
  try {
    console.log('Fetching messages for provider user:', providerUserId);
    const result = await pool.query(
      `
      SELECT m.*, u.email AS sender_email, p.title AS project_title
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN projects p ON m.project_id = p.id
      JOIN providers pr ON m.receiver_id = pr.user_id
      WHERE pr.user_id = $1
      ORDER BY m.created_at DESC
    `,
      [providerUserId]
    );
    console.log('Messages fetched:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch provider messages error:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get user messages
router.get('/user', verifyToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    console.log('Fetching messages for user:', userId);
    const result = await pool.query(
      `
      SELECT m.*, u.email AS sender_email, p.title AS project_title
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN projects p ON m.project_id = p.id
      WHERE m.receiver_id = $1 OR m.sender_id = $1
      ORDER BY m.created_at DESC
    `,
      [userId]
    );
    console.log('User messages fetched:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch user messages error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user messages' });
  }
});

module.exports = router;