const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /debug/agents-schema
router.get('/agents-schema', (req, res) => {
  db.all(`PRAGMA table_info(Agents);`, (err, rows) => {
    if (err) {
      console.error('Error fetching schema:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, schema: rows });
  });
});

// GET /debug/agents-data
router.get('/agents-data', (req, res) => {
  db.all(`SELECT * FROM Agents`, (err, rows) => {
    if (err) {
      console.error('Error fetching agent data:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, agents: rows });
  });
});

module.exports = router;
