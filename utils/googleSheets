// VB-v1.01-main/utils/googleSheets.js

const { GoogleSpreadsheet } = require('google-spreadsheet');

/**
 * Posts a call summary note to a specified Google Sheet row.
 * 
 * @param {Object} sheetConfig - Configuration object for the Google Sheet
 * @param {string} sheetConfig.sheet_id - The ID of the Google Sheet
 * @param {string} sheetConfig.client_email - Service account email
 * @param {string} sheetConfig.private_key - Service account private key
 * @param {string} leadId - Row number or identifier for the lead
 * @param {string} note - The call summary or note content
 */
async function postNoteToGoogleSheets(sheetConfig, leadId, note) {
  try {
    const doc = new GoogleSpreadsheet(sheetConfig.sheet_id);
    await doc.useServiceAccountAuth({
      client_email: sheetConfig.client_email,
      private_key: sheetConfig.private_key.replace(/\\n/g, '\n'),
    });
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0];
    await sheet.loadCells(); // Optional: only needed if accessing cells

    const rows = await sheet.getRows();
    const targetRow = rows.find(r => r.ID?.toString() === leadId.toString());

    if (targetRow) {
      targetRow.Note = note;
      await targetRow.save();
      console.log(`✅ Note added to Google Sheets row for lead ID ${leadId}`);
    } else {
      console.warn(`⚠️ Lead ID ${leadId} not found in sheet`);
    }
  } catch (error) {
    console.error('❌ Error posting note to Google Sheets:', error.message);
  }
}

module.exports = { postNoteToGoogleSheets };
