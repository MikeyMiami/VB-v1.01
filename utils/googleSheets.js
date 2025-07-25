const { GoogleSpreadsheet } = require('google-spreadsheet');
const { Buffer } = require('buffer');

// Decode the base64 service account JSON string from .env
function getSheetClient() {
  const credsBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  if (!credsBase64) throw new Error("GOOGLE_SERVICE_ACCOUNT_BASE64 is not defined");

  const decoded = Buffer.from(credsBase64, 'base64').toString('utf8');
  const creds = JSON.parse(decoded);

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
  return { doc, creds };
}

async function fetchGoogleSheetLeads() {
  try {
    const { doc, creds } = getSheetClient();
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();

    const rows = await sheet.getRows();
    const leads = rows
      .map(row => {
        const data = {};
        for (const header of sheet.headerValues) {
          data[header] = row[header] || "";
        }
        return data;
      })
      .filter(lead => lead["Phone"] && lead["Phone"].trim() !== "");

    return leads;
  } catch (err) {
    console.error("❌ Failed to fetch leads from Google Sheets:", err);
    throw err;
  }
}

module.exports = {
  fetchGoogleSheetLeads,
};
