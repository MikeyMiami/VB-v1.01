// /jobs/resetAgentUsage.js
const db = require('../db');
const moment = require('moment-timezone');

async function runAgentUsageReset() {
  try {
    const { rows: agents } = await db.query(`SELECT id, name, minutes_used, dial_limit, timezone FROM Agents`);

    for (const agent of agents) {
      const tz = agent.timezone || 'America/New_York'; // fallback timezone
      const now = moment().tz(tz);

      // ⏰ Only run at 3:00 AM in agent's timezone
      if (now.hour() === 3 && now.minute() === 0) {
        await db.query(`UPDATE Agents SET minutes_used = 0 WHERE id = $1`, [agent.id]);
        await db.query(`DELETE FROM CallAttempts WHERE agentId = $1 AND DATE(createdDate) = CURRENT_DATE`, [agent.id]);

        console.log(`🔁 Reset usage for Agent ${agent.name} at 3:00 AM (${tz})`);
      }
    }
  } catch (err) {
    console.error('❌ Error resetting agent usage:', err.message);
  }
}

module.exports = runAgentUsageReset;
