// VB-v1.01-main/services/post-call-summary.js
const db = require('../db');
const { createNoteForContact } = require('../utils/hubspot');
const { writeCallResultToSheet } = require('../utils/googleSheets');

/**
 * Handles creating a post‑call summary note in the proper integration.
 * @param {Object} params
 * @param {string|number} params.botId      – Agent ID
 * @param {string}       params.contactId  – Contact identifier (HubSpot VID or “GSheetRowN”)
 * @param {string}       params.summary    – AI‑generated summary text
 * @param {string}       params.callTime   – e.g. “2:43pm EST”
 * @param {number}       params.duration   – Duration in seconds
 * @param {string}       params.outcome    – Call outcome label
 */
async function handlePostCallSummary({
  botId,
  contactId,
  summary,
  callTime,
  duration,
  outcome,
}) {
  if (!botId || !summary) {
    throw new Error('Missing botId or summary.');
  }

  // 1) Load the agent record
  const { rows: agentRows } = await db.query(
    'SELECT * FROM Agents WHERE id = $1',
    [botId]
  );
  const agent = agentRows[0];
  if (!agent) {
    throw new Error('Agent not found');
  }

  // 2) Load the integration record
  const { rows: integrationRows } = await db.query(
    'SELECT * FROM Integrations WHERE id = $1',
    [agent.integrationid]
  );
  const integration = integrationRows[0];
  if (!integration) {
    throw new Error('Integration not found');
  }

  // 3) Build the formatted note text
  const note = `📝 **Call Summary**
- Call Time: ${callTime}
- Duration: ${duration}
- Outcome: ${outcome}
- AI Summary: ${summary}`;

  // 4) Dispatch to the correct integration
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
        summary,
      });
      console.log('✅ Note logged to Google Sheets.');
    } else {
      console.warn('⚠️ No contactId for Google Sheets or format mismatch.');
    }

  } else {
    console.warn('⚠️ Unknown integration type.');
  }
}

module.exports = {
  handlePostCallSummary,
};

