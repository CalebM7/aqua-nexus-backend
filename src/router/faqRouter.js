const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

router.get('/', (req, res) => {
  // Correct path: go up one directory from src
  const faqsPath = path.resolve(__dirname, '../knowledge_base.json');
  console.log('[FAQ ROUTE] Looking for knowledge_base.json at:', faqsPath);
  const exists = fs.existsSync(faqsPath);
  console.log('[FAQ ROUTE] File exists:', exists);
  if (exists) {
    const kb = JSON.parse(fs.readFileSync(faqsPath, 'utf8'));
    console.log(
      '[FAQ ROUTE] FAQ count:',
      Array.isArray(kb.faqs) ? kb.faqs.length : 'not an array'
    );
    res.json(kb.faqs || []);
  } else {
    res.status(404).json([]);
  }
});

module.exports = { faqRouter: router };
