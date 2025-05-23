const { pool } = require("../database/config");

// Add a review
const addReview = async (req, res) => {
  const { provider_id, rating, comment } = req.body;
  const user_id = req.user.userId;
  try {
    if (!provider_id || !rating) {
      return res.status(400).json({ error: "Missing provider_id or rating" });
    }
    const result = await pool.query(
      `INSERT INTO reviews (provider_id, user_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [provider_id, user_id, rating, comment || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to add review" });
  }
};

// Get reviews for a provider
const getProviderReviews = async (req, res) => {
  const { providerId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM reviews WHERE provider_id = $1 ORDER BY created_at DESC`,
      [providerId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};

module.exports = { addReview, getProviderReviews };
