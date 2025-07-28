// routes/test.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Uses your PostgreSQL pool

router.post('/test-db', async (req, res) => {
  try {
    // Ensure test_table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        message TEXT
      )
    `);

    // Insert a test row
    await db.query(
      'INSERT INTO test_table (message) VALUES ($1)',
      ['Hello from Web App']
    );

    res.send('✅ Data inserted by web app');
  } catch (err) {
    console.error('❌ Test DB error:', err.message);
    res.status(500).send('Insert failed: ' + err.message);
  }
});

module.exports = router;
