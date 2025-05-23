const { pool } = require("../database/config");

// Get all providers (public)
const getAllProviders = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.user_id, p.name, p.service_type, p.description, p.price_range_min,
             p.price_range_max, p.service_areas, p.services, p.image, p.certifications,
             p.rating, COUNT(r.id) as reviews
      FROM providers p
      LEFT JOIN reviews r ON p.id = r.provider_id
      GROUP BY p.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch providers" });
  }
};

// Get provider by ID (authenticated)
const getProviderById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `
      SELECT p.id, p.user_id, p.name, p.service_type, p.description, p.price_range_min,
             p.price_range_max, p.service_areas, p.services, p.image, p.certifications,
             p.rating, COUNT(r.id) as reviews
      FROM providers p
      LEFT JOIN reviews r ON p.id = r.provider_id
      WHERE p.id = $1
      GROUP BY p.id
    `,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch provider" });
  }
};

// Update provider profile (authenticated)
const updateProvider = async (req, res) => {
  const { id } = req.params;
  const {
    description,
    service_type,
    price_range_min,
    price_range_max,
    service_areas,
    services,
    certifications,
  } = req.body;
  try {
    const result = await pool.query(
      `
      UPDATE providers
      SET description = $1, service_type = $2, price_range_min = $3,
          price_range_max = $4, service_areas = $5, services = $6, certifications = $7
      WHERE id = $8
      RETURNING id, user_id, name, service_type, description, price_range_min,
                price_range_max, service_areas, services, image, certifications, rating
    `,
      [
        description,
        service_type,
        price_range_min,
        price_range_max,
        service_areas,
        services,
        certifications,
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update provider" });
  }
};

module.exports = {
  getAllProviders,
  getProviderById,
  updateProvider,
};
