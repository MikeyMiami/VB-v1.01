const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// Create integration (protected, user sets creds)
router.post('/create', async (req, res) => {
  const { userId, integration_type, api_key, creds } = req.body;
  try {
    const hashedKey = await bcrypt.hash(api_key, 10); // Hash for security
    const credsJson = JSON.stringify(creds || {});
    db.run(`INSERT INTO Integrations (userId, integration_type, api_key, creds) VALUES (?, ?, ?, ?)`,
      [userId, integration_type, hashedKey, credsJson],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ integrationId: this.lastID });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update integration (protected, user updates creds)
router.patch('/update/:integrationId', async (req, res) => {
  const { api_key, creds } = req.body;
  try {
    const hashedKey = api_key ? await bcrypt.hash(api_key, 10) : null;
    const credsJson = creds ? JSON.stringify(creds) : null;
    db.run(`UPDATE Integrations SET api_key = COALESCE(?, api_key), creds = COALESCE(?, creds), modifiedDate = CURRENT_TIMESTAMP WHERE id = ?`,
      [hashedKey, credsJson, req.params.integrationId],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
