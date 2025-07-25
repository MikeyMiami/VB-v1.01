const { GoogleSpreadsheet } = require('google-spreadsheet');
const Buffer = require('buffer').Buffer;

async function getSheetClient(sheetId) {
  const doc = new GoogleSpreadsheet(sheetId);

  const encodedKey = process.env.GOOGLE_PRIVATE_KEY_BASE64;
  if (!encodedKey) {
    throw new Error('Missing GOOGLE_PRIVATE_KEY_BASE64 env variable');
  }

  const credentialsJSON = Buffer.from(encodedKey, 'base64').toString('utf8');
  const credentials = JSON.parse(credentialsJSON);

  await doc.useServiceAccountAuth({
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  });

  await doc.loadInfo();
  return doc;
}

async function fetchGoogleSheetLeads(sheetId, sheetIndex = 0) {
  try {
    const doc = await getSheetClient(sheetId);
    const sheet = doc.sheetsByIndex[sheetIndex];
    await sheet.loadHeaderRow();

    const rows = await sheet.getRows();
    const leads = rows.map(row => {
      const data = {};
      for (const header of sheet.headerValues) {
        data[header] = row[header] || ""; // Return empty string if cell is blank
      }
      return data;
    });

    return leads;
  } catch (error) {
    console.error('❌ Failed to fetch leads from Google Sheets:', error);
    throw error;
  }
}

module.exports = {
  fetchGoogleSheetLeads,
};
