const { GoogleSpreadsheet } = require('google-spreadsheet');

async function getSheetClient() {
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8')
  );
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
  await doc.useServiceAccountAuth(credentials);
  await doc.loadInfo();
  return doc;
}

async function fetchGoogleSheetLeads() {
  const doc = await getSheetClient();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  return rows
    .filter(row => row.Status === 'Not Called' && row.Phone)
    .map((row, index) => ({
      name: row.Name,
      phone: row.Phone,
      email: row.Email,
      company: row.Company,
      rowIndex: index,
    }));
}

async function writeCallResultToSheet(rowIndex, result) {
  const doc = await getSheetClient();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();
  const row = rows[rowIndex];

  row.Status = result.status || 'Connected';
  row['Call Summary'] = result.summary || '';

  const currentCallCount = parseInt(row['# of Calls'] || '0', 10);
  row['# of Calls'] = currentCallCount + 1;

  await row.save();
}

module.exports = {
  fetchGoogleSheetLeads,
  writeCallResultToSheet,
  getLeadsFromGoogleSheets: fetchGoogleSheetLeads, // alias for compatibility
};
