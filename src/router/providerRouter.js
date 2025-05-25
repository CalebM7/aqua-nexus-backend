const express = require('express');
const multer = require('multer');
const path = require('path');
const { verifyToken } = require('../middleware/tokenMiddleware');
const {
  getAllProviders,
  getProviderById,
  updateProvider,
} = require('../controllers/providers');

const router = express.Router();

// Multer config for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'Uploads/');
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
    cb(new Error('Only JPEG/PNG images are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Get all providers (public)
router.get('/', getAllProviders);

// Get provider by ID (public)
router.get('/:id', getProviderById);

// Update provider profile (authenticated)
router.put('/:id', verifyToken, updateProvider);

// Upload provider image (authenticated)
router.post(
  '/:id/image',
  verifyToken,
  upload.single('image'),
  async (req, res) => {
    const { id } = req.params;
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
      }
      const imagePath = `/uploads/${req.file.filename}`;
      const result = await require('../database/config').pool.query(
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
        return res.status(404).json({ error: 'Provider not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to upload image' });
    }
  }
);

module.exports = { providerRouter: router };
