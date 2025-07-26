// routes/test.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Assumes your db.js uses process.env.DISK_PATH

router.post('/test-db', (req, res) => {
  db.run(`CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, message TEXT)`);
  db.run(`INSERT INTO test_table (message) VALUES (?)`, ['Hello from Web App'], (err) => {
    if (err) return res.status(500).send('Insert failed: ' + err.message);
    res.send('✅ Data inserted by web app');
  });
});

module.exports = router;
