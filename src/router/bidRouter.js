// src/router/bidRouter.js
const express = require('express');
const { verifyToken } = require('../middleware/tokenMiddleware');
const {
  submitBid,
  getBidsByProject,
  updateBidStatus,
  getProviderBids,
} = require('../controllers/bids');

const router = express.Router();

router.post('/', verifyToken, submitBid);
router.get('/', verifyToken, getBidsByProject);
router.patch('/:id', verifyToken, updateBidStatus);
router.get('/me', verifyToken, getProviderBids);

module.exports = { bidRouter: router };
