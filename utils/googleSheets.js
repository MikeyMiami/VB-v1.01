// VB-v1.01-main/utils/googleSheets.js
const { GoogleSpreadsheet } = require('google-spreadsheet');

function getSheetClient() {
  const base64Credentials = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!base64Credentials) {
    throw new Error('GOOGLE_CREDENTIALS_BASE64 is not defined');
  }

  const decoded = Buffer.from(base64Credentials, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

async function fetchGoogleSheetLeads() {
  const creds = getSheetClient();

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  // Filter rows to only include those with a phone number
  const leads = rows
    .filter((row) => row.Phone || row.phone || row['Phone Number'] || row['phone number'])
    .map((row) => {
      const obj = {};
      sheet.headerValues.forEach((header) => {
        obj[header] = row[header] || '';
      });
      return obj;
    });

  return leads;
}

module.exports = {
  fetchGoogleSheetLeads,
};
