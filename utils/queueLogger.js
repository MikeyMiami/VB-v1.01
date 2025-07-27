// utils/queueLogger.js
const db = require('../db');

async function logAgentQueue(agentId, message) {
  try {
    await db.query(
      `INSERT INTO AgentQueueLogs (agentId, message) VALUES ($1, $2)`,
      [agentId, message]
    );
  } catch (err) {
    console.error('❌ Failed to log queue message:', err.message);
  }
}

module.exports = { logAgentQueue };
