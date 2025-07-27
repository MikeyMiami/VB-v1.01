// jobs/resetAgentUsage.js
const db = require('../db');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const runAgentUsageReset = async () => {
  const now = dayjs().tz('America/New_York');
  const hour = now.hour();
  const minute = now.minute();

  // Only run at exactly 3:00am EST
  if (hour !== 3 || minute !== 0) {
    return;
  }

  try {
    // Reset daily call attempts
    await db.query(`DELETE FROM CallAttempts WHERE DATE(createdDate) < CURRENT_DATE`);
    console.log(`✅ Cleared previous day CallAttempts at ${now.format()}`);

    // Reset minutes_used on the 1st
    if (now.date() === 1) {
      await db.query(`UPDATE Agents SET minutes_used = 0`);
      console.log(`🔁 Reset monthly minutes_used for all agents`);
    }
  } catch (err) {
    console.error('❌ Error during resetAgentUsage:', err.message);
  }
};

module.exports = runAgentUsageReset;
