// utils/queueLogger.js
const db = require('../db');

/**
 * Logs a message for a specific agent to the agentqueuelogs table
 * @param {string} agentId - The agent's ID
 * @param {string} message - The log message
 */
async function logAgentQueue(agentId, message) {
  if (!agentId || !message) return;

  try {
    await db.query(
      `INSERT INTO agentqueuelogs (agentid, message, timestamp, createddate, modifieddate)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [agentId, message]
    );
    console.log(`📝 Logged message for agent ${agentId}: ${message}`);
  } catch (err) {
    console.error('❌ Failed to log agent queue message:', err.message);
  }
}

module.exports = { logAgentQueue };
