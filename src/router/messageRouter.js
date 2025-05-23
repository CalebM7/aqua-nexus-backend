const express = require("express");
const { verifyToken } = require("../middleware/tokenMiddleware");
const {
  messagesFunc,
  getProviderMessages,
  getUserMessages,
  replyMessage,
} = require("../controllers/messages");

const router = express.Router();

router.post("/", verifyToken, messagesFunc);
router.get("/provider", verifyToken, getProviderMessages);
router.get("/user", verifyToken, getUserMessages);
router.post("/reply", verifyToken, replyMessage);

module.exports = { messageRouter: router };
