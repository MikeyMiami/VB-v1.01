// jobs/resetAgentUsage.js
const db = require('../db');
const moment = require('moment-timezone');
const { logAgentQueue } = require('../utils/queueLogger');

module.exports = async function runAgentUsageReset() {
  try {
    const { rows: agents } = await db.query(`SELECT id, timezone FROM Agents`);
    const utcNow = moment.utc();

    for (const agent of agents) {
      const agentTime = utcNow.clone().tz(agent.timezone || 'America/New_York');
      const is3AM = agentTime.hour() === 3 && agentTime.minute() === 0;

      if (is3AM) {
        // ✅ Reset daily call attempts
        await db.query(`DELETE FROM CallAttempts WHERE agentId = $1 AND DATE(createdDate) = CURRENT_DATE`, [agent.id]);
        await logAgentQueue(agent.id, '🔁 Daily call attempts reset at 3AM.');

        // ✅ Reset monthly minutes_used only on 1st of the month
        if (agentTime.date() === 1) {
          await db.query(`UPDATE Agents SET minutes_used = 0 WHERE id = $1`, [agent.id]);
          await logAgentQueue(agent.id, '🔁 Monthly minutes_used reset to 0.');
        }
      }
    }
  } catch (err) {
    console.error('❌ Error in runAgentUsageReset:', err.message);
  }
};
