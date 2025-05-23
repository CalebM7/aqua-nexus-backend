const { pool } = require("../database/config");

const testDB = async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ message: "Database connected", time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: "Database connection failed" });
  }
};

module.exports = { testDB };
