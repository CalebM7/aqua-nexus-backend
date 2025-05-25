// src/router/notificationRouter.js
const express = require("express");
const router = express.Router();
const { getNotifications } = require("../controllers/notifications");
const { verifyToken } = require("../middleware/tokenMiddleware");

router.get("/", verifyToken, getNotifications);

module.exports = { notificationRouter: router };