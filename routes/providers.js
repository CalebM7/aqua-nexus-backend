const express = require("express");
const pool = require("../db/pool");
const verifyToken = require("../middleware/auth");
const multer = require("multer");
const path = require("path");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "Uploads/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `provider-${req.params.id}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPEG/PNG images are allowed"));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Get all providers (public)
router.get("/", async (req, res) => {
  try {
    console.log("GET /providers: Fetching all providers");
    const result = await pool.query(`
      SELECT p.id, p.user_id, p.name, p.service_type, p.description, p.price_range_min,
             p.price_range_max, p.service_areas, p.services, p.image, p.certifications,
             p.rating, COUNT(r.id) as reviews
      FROM providers p
      LEFT JOIN reviews r ON p.id = r.provider_id
      GROUP BY p.id
    `);
    console.log("GET /providers: Providers fetched:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /providers: Error:", err.message);
    res.status(500).json({ error: "Failed to fetch providers" });
  }
});

// Add backward compatibility for /provider/:id
router.get("/provider/:id", async (req, res) => {
  // Proxy to /providers/:id
  req.url = `/providers/${req.params.id}`;
  res.redirect(301, `/providers/${req.params.id}`);
});

// Get provider by ID (authenticated)
router.get("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log("GET /provider/:id: Fetching provider:", id);
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
      console.log("GET /provider/:id: Provider not found:", id);
      return res.status(404).json({ error: "Provider not found" });
    }
    console.log("GET /provider/:id: Provider fetched:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /provider/:id: Error:", err.message);
    res.status(500).json({ error: "Failed to fetch provider" });
  }
});

// Update provider profile (authenticated)
router.put("/:id", verifyToken, async (req, res) => {
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
    console.log("PUT /provider/:id: Updating provider:", id);
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
      console.log("PUT /provider/:id: Provider not found:", id);
      return res.status(404).json({ error: "Provider not found" });
    }
    console.log("PUT /provider/:id: Provider updated:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /provider/:id: Error:", err.message);
    res.status(500).json({ error: "Failed to update provider" });
  }
});

// Upload provider image (authenticated)
router.post(
  "/:id/image",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    const { id } = req.params;
    try {
      console.log(
        "POST /provider/:id/image: Uploading image for provider:",
        id
      );
      if (!req.file) {
        console.log("POST /provider/:id/image: No file uploaded");
        return res.status(400).json({ error: "No image uploaded" });
      }
      const imagePath = `/uploads/${req.file.filename}`;
      const result = await pool.query(
        `
      UPDATE providers
      SET image = $1
      WHERE id = $2
      RETURNING id, user_id, name, service_type, description, price_range_min,
                price_range_max, service_areas, services, image, certifications, rating
    `,
        [imagePath, id]
      );
      if (result.rows.length === 0) {
        console.log("POST /provider/:id/image: Provider not found:", id);
        return res.status(404).json({ error: "Provider not found" });
      }
      console.log("POST /provider/:id/image: Image uploaded:", result.rows[0]);
      res.json(result.rows[0]);
    } catch (err) {
      console.error("POST /provider/:id/image: Error:", err.message);
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

module.exports = router;
