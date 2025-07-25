const db = require('../db');
const { createNoteForContact } = require('../utils/hubspot');
const { writeCallResultToSheet } = require('../utils/googleSheets');

async function handlePostCallSummary({ botId, contactId, summary, callTime, duration, outcome }) {
  if (!botId || !summary) {
    throw new Error('Missing botId or summary.');
  }

  // Get agent & integration info
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM Agents WHERE id = ?`, [botId], async (err, agent) => {
      if (err || !agent) return reject(err || new Error('Agent not found'));

      db.get(`SELECT * FROM Integrations WHERE id = ?`, [agent.integrationId], async (err, integration) => {
        if (err || !integration) return reject(err || new Error('Integration not found'));

        const note = `📝 **Call Summary**
- Call Time: ${callTime}
- Duration: ${duration}
- Outcome: ${outcome}
- AI Summary: ${summary}`;

        if (integration.integration_type === 'hubspot') {
          if (contactId) {
            await createNoteForContact(contactId, note);
            console.log('✅ Note logged to HubSpot.');
          } else {
            console.warn('⚠️ No contactId for HubSpot note.');
          }
        } else if (integration.integration_type === 'google_sheets') {
          if (contactId && contactId.startsWith('GSheetRow')) {
            const rowIndex = parseInt(contactId.replace('GSheetRow', ''), 10);
            await writeCallResultToSheet(rowIndex, {
              status: outcome,
              summary
            });
            console.log('✅ Note logged to Google Sheets.');
          } else {
            console.warn('⚠️ No contactId for Google Sheets or format mismatch.');
          }
        } else {
          console.warn('⚠️ Unknown integration type.');
        }

        resolve();
      });
    });
  });
}

module.exports = {
  handlePostCallSummary,
};
