// VB-v1.01-main/routes/integrations.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Create integration (protected, user sets creds)
router.post('/create', async (req, res) => {
  const { userId, integration_type, api_key, creds } = req.body;
  const credsJson = JSON.stringify(creds || {});
  db.run(
    `INSERT INTO Integrations (userId, integration_type, api_key, creds)
     VALUES (?, ?, ?, ?)`,
    [userId, integration_type, api_key, credsJson],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ integrationId: this.lastID });
    }
  );
});

// Update integration (protected, user updates creds or key)
router.patch('/update/:integrationId', async (req, res) => {
  const { api_key, creds } = req.body;

  // Only serialize creds if provided
  const credsJson = creds !== undefined ? JSON.stringify(creds) : null;

  db.run(
    `UPDATE Integrations
     SET
       api_key = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE api_key END,
       creds = CASE WHEN ? IS NOT NULL THEN ? ELSE creds END,
       modifiedDate = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      api_key, api_key, api_key,
      credsJson, credsJson,
      req.params.integrationId
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
