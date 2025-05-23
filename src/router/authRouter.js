const express = require("express");
const { signup, login, logout, refreshToken, me } = require("../controllers/auth");
const { verifyToken } = require("../middleware/tokenMiddleware");
const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh-token", refreshToken);
router.post("/refresh", refreshToken); // Add this line
router.get("/me", verifyToken, me);

module.exports = { authRouter: router };
