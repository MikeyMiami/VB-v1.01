// VB-v1.01-main/routes/debug.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /debug/agents-schema
router.get('/agents-schema', async (req, res) => {
  try {
    // Pull schema info from Postgres’s information_schema
    const { rows } = await db.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = $1`,
      ['agents']
    );
    res.json({ success: true, schema: rows });
  } catch (err) {
    console.error('Error fetching schema:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /debug/agents-data
router.get('/agents-data', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM Agents`, []);
    res.json({ success: true, agents: rows });
  } catch (err) {
    console.error('Error fetching agent data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

