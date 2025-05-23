const express = require("express");
const { verifyToken } = require("../middleware/tokenMiddleware");
const { submitBid } = require("../controllers/bids");

const router = express.Router();

router.post("/", verifyToken, submitBid);

module.exports = { bidRouter: router };
