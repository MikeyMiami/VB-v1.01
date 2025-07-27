// VB-v1.01-main/utils/queueUtils.js
const db = require('../db');

/**
 * Get the number of call attempts for a specific agent + phone number combo.
 */
function getCallAttempts(agentId, leadPhone) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT attemptCount FROM CallAttempts WHERE agentId = ? AND leadPhone = ?`,
      [agentId, leadPhone],
      (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.attemptCount : 0);
      }
    );
  });
}

/**
 * Increment the call attempt count or insert a new record if it doesn't exist.
 */
function incrementCallAttempt(agentId, leadPhone) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM CallAttempts WHERE agentId = ? AND leadPhone = ?`,
      [agentId, leadPhone],
      (err, row) => {
        if (err) return reject(err);

        const now = new Date().toISOString();

        if (row) {
          // Update
          db.run(
            `UPDATE CallAttempts
             SET attemptCount = attemptCount + 1,
                 lastAttemptTime = ?,
                 modifiedDate = ?
             WHERE agentId = ? AND leadPhone = ?`,
            [now, now, agentId, leadPhone],
            function (err) {
              if (err) return reject(err);
              resolve({ updated: true });
            }
          );
        } else {
          // Insert
          db.run(
            `INSERT INTO CallAttempts (agentId, leadPhone, attemptCount, lastAttemptTime, status, createdDate, modifiedDate)
             VALUES (?, ?, 1, ?, 'in_progress', ?, ?)`,
            [agentId, leadPhone, now, now, now],
            function (err) {
              if (err) return reject(err);
              resolve({ inserted: true });
            }
          );
        }
      }
    );
  });
}

/**
 * Mark a lead's call attempt as completed with a status (e.g. success, failed).
 */
function markCallAttemptStatus(agentId, leadPhone, status) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE CallAttempts
       SET status = ?, modifiedDate = ?
       WHERE agentId = ? AND leadPhone = ?`,
      [status, now, agentId, leadPhone],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

module.exports = {
  getCallAttempts,
  incrementCallAttempt,
  markCallAttemptStatus,
};
