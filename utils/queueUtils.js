// VB-v1.01-main/utils/queueUtils.js
const db = require('../db');

/**
 * Get the number of call attempts for a specific agent + phone number combo.
 */
async function getCallAttempts(agentId, leadPhone) {
  try {
    const { rows } = await db.query(
      'SELECT attemptCount FROM CallAttempts WHERE agentId = $1 AND leadPhone = $2',
      [agentId, leadPhone]
    );
    // Return zero if no record, otherwise the stored count
    return rows.length > 0 ? rows[0].attemptcount : 0;
  } catch (err) {
    console.error('❌ Error in getCallAttempts:', err.message);
    throw err;
  }
}

/**
 * Increment the call attempt count or insert a new record if it doesn't exist.
 */
async function incrementCallAttempt(agentId, leadPhone) {
  const now = new Date().toISOString();
  try {
    // Check if a record already exists
    const { rows } = await db.query(
      'SELECT * FROM CallAttempts WHERE agentId = $1 AND leadPhone = $2',
      [agentId, leadPhone]
    );

    if (rows.length > 0) {
      // Update existing record
      await db.query(
        `UPDATE CallAttempts
         SET attemptCount = attemptCount + 1,
             lastAttemptTime = $1,
             modifiedDate = $2
         WHERE agentId = $3 AND leadPhone = $4`,
        [now, now, agentId, leadPhone]
      );
      return { updated: true };
    } else {
      // Insert new record
      await db.query(
        `INSERT INTO CallAttempts
           (agentId, leadPhone, attemptCount, lastAttemptTime, status, createdDate, modifiedDate)
         VALUES
           ($1, $2, 1, $3, 'in_progress', $4, $5)`,
        [agentId, leadPhone, now, now, now]
      );
      return { inserted: true };
    }
  } catch (err) {
    console.error('❌ Error in incrementCallAttempt:', err.message);
    throw err;
  }
}

/**
 * Mark a lead's call attempt as completed with a status (e.g. success, failed).
 */
async function markCallAttemptStatus(agentId, leadPhone, status) {
  const now = new Date().toISOString();
  try {
    await db.query(
      `UPDATE CallAttempts
       SET status = $1,
           modifiedDate = $2
       WHERE agentId = $3 AND leadPhone = $4`,
      [status, now, agentId, leadPhone]
    );
    return true;
  } catch (err) {
    console.error('❌ Error in markCallAttemptStatus:', err.message);
    throw err;
  }
}

module.exports = {
  getCallAttempts,
  incrementCallAttempt,
  markCallAttemptStatus,
};

