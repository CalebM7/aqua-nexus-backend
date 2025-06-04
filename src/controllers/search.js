const { pool } = require('../database/config');
const fs = require('fs');
const path = require('path');

// Use absolute path for FAQ file
let cachedFaqs = null;
const faqsPath = path.resolve(__dirname, '../knowledge_base.json');
const loadFaqs = () => {
  if (!cachedFaqs && fs.existsSync(faqsPath)) {
    const kb = JSON.parse(fs.readFileSync(faqsPath, 'utf8'));
    cachedFaqs = kb.faqs || [];
  }
};
loadFaqs();

const searchAll = async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query too short' });
  }
  try {
    // Use LIMIT and only select needed columns for speed
    const projectsPromise = pool.query(
      `SELECT id, title, description, service_type, budget
       FROM projects
       WHERE to_tsvector('english', title || ' ' || coalesce(description, '')) @@ plainto_tsquery('english', $1)
       LIMIT 5`,
      [q]
    );

    const providersPromise = pool.query(
      `SELECT id, name, description, service_type, rating
       FROM providers
       WHERE to_tsvector('english', name || ' ' || coalesce(description, '')) @@ plainto_tsquery('english', $1)
       LIMIT 5`,
      [q]
    );

    // Use cached FAQs for speed
    let faqs = [];
    if (cachedFaqs) {
      const qLower = q.toLowerCase();
      faqs = cachedFaqs
        .filter(
          (faq) =>
            faq.q.toLowerCase().includes(qLower) ||
            faq.a.toLowerCase().includes(qLower)
        )
        .slice(0, 5);
    }

    // Run DB queries in parallel
    const [projects, providers] = await Promise.all([
      projectsPromise,
      providersPromise,
    ]);

    res.json({
      projects: projects.rows,
      providers: providers.rows,
      faqs,
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
};

module.exports = { searchAll };
