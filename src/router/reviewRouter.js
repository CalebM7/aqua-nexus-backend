const express = require("express");
const { verifyToken } = require("../middleware/tokenMiddleware");
const { addReview, getProviderReviews } = require("../controllers/reviews");

const router = express.Router();

router.post("/", verifyToken, addReview);
router.get("/:providerId", getProviderReviews);

module.exports = { reviewRouter: router };
