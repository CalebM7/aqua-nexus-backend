const express = require('express');
const { searchAll } = require('../controllers/search');
const router = express.Router();

router.get('/', searchAll);

module.exports = { searchRouter: router };
