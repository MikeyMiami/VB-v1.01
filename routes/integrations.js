// routes/integrations.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Create integration (protected, user sets creds)
router.post('/create', async (req, res) => {
  const { userId, integration_type, api_key, creds } = req.body;
  const credsJson = JSON.stringify(creds || {});

  try {
    const result = await db.query(
      `INSERT INTO Integrations (userId, integration_type, api_key, creds)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, integration_type, api_key, credsJson]
    );
    res.json({ integrationId: result.rows[0].id });
  } catch (err) {
    console.error('Error creating integration:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update integration (protected, user updates creds or key)
router.patch('/update/:integrationId', async (req, res) => {
  const { api_key, creds } = req.body;
  const integrationId = req.params.integrationId;

  // Only serialize creds if provided
  const credsJson = creds !== undefined ? JSON.stringify(creds) : null;

  try {
    await db.query(
      `UPDATE Integrations
       SET
         api_key      = CASE WHEN $1 IS NOT NULL AND $1 <> '' THEN $1 ELSE api_key END,
         creds        = CASE WHEN $2 IS NOT NULL         THEN $2 ELSE creds    END,
         modifiedDate = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [api_key, credsJson, integrationId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating integration:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

