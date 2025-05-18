const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Submit a review
router.post('/', verifyToken, async (req, res) => {
  const { provider_id, rating, comment } = req.body;
  const userId = req.user.userId;
  try {
    console.log('Submitting review for provider:', provider_id, 'by user:', userId);
    if (!provider_id || !rating || rating < 1 || rating > 5) {
      console.log('Invalid provider_id or rating:', { provider_id, rating });
      return res.status(400).json({ error: 'Invalid provider_id or rating' });
    }
    const review = await pool.query(
      'INSERT INTO reviews (provider_id, user_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [provider_id, userId, rating, comment || null]
    );
    const ratings = await pool.query(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE provider_id = $1',
      [provider_id]
    );
    await pool.query(
      'UPDATE providers SET rating = $1, reviews = $2 WHERE id = $3',
      [ratings.rows[0].avg_rating, ratings.rows[0].review_count, provider_id]
    );
    console.log('Review submitted for provider:', provider_id);
    res.status(201).json(review.rows[0]);
  } catch (err) {
    console.error('Review error:', err.message);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

module.exports = router;