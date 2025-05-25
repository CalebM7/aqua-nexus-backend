// src/controllers/notifications.js
const { pool } = require("../database/config");

const getNotifications = async (req, res) => {
  const userId = req.user.userId;

  try {
    const notifications = await pool.query(
      `SELECT n.id, n.type, n.read, n.created_at,
              p.title AS project_title,
              m.content AS message_content
       FROM notifications n
       LEFT JOIN projects p ON n.project_id = p.id
       LEFT JOIN messages m ON n.message_id = m.id
       WHERE n.user_id = $1 AND n.read = FALSE
       ORDER BY n.created_at DESC`,
      [userId]
    );

    res.status(200).json(notifications.rows);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getNotifications };