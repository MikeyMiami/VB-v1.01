// VB-v1.01-main/utils/integrations.js
async function fetchLeads(integrationId, listId) {
  return new Promise((resolve, reject) => {
    const db = require('../db');
    db.get(`SELECT * FROM Integrations WHERE id = ?`, [integrationId], async (err, integration) => {
      if (err) return reject(err);
      if (!integration) return resolve([]);

      let creds;
      try {
        creds = JSON.parse(integration.creds || '{}');
      } catch (e) {
        return reject(e);
      }

      switch (integration.integration_type) {
        case 'hubspot':
          const hubspot = require('@hubspot/api-client');
          const client = new hubspot.Client({ accessToken: integration.api_key });
          let results;
          if (listId) {
            // Fetch contacts from a specific list
            const membershipsApi = client.crm.lists.membershipsApi;
            const listResponse = await membershipsApi.getPage(listId, '100', '', ['phone'], false, false); // Limit as string '100', after as ''
            results = listResponse.results.map(contact => ({ phone: contact.properties.phone, id: contact.id }));
          } else {
            // Fetch all contacts if no listId
            const { results: allContacts } = await client.crm.contacts.basicApi.getPage('100', '', ['phone'], false); // Limit as '100', after as ''
            results = allContacts.map(c => ({ phone: c.properties.phone, id: c.id }));
          }
          resolve(results);
          break;
        case 'salesforce':
          const jsforce = require('jsforce');
          const conn = new jsforce.Connection();
          await conn.login(creds.username, integration.api_key); // Assume api_key is password+token
          const leads = await conn.query('SELECT Id, Phone FROM Lead');
          resolve(leads.records.map(l => ({ phone: l.Phone, id: l.Id })));
          break;
        case 'google_sheets':
          const { GoogleSpreadsheet } = require('google-spreadsheet');
          const doc = new GoogleSpreadsheet(creds.sheet_id);
          await doc.useServiceAccountAuth({ client_email: creds.client_email, private_key: creds.private_key });
          await doc.loadInfo();
          const sheet = doc.sheetsByIndex[0];
          const rows = await sheet.getRows();
          resolve(rows.map(r => ({ phone: r.phone, id: r._rowNumber }))); // Assume columns like 'phone'
          break;
        default:
          resolve([]);
      }
    });
  });
}

async function bookAppointment(integrationId, time, details) {
  return new Promise((resolve, reject) => {
    const db = require('../db');
    db.get(`SELECT * FROM Integrations WHERE id = ?`, [integrationId], async (err, integration) => {
      if (err) return reject(err);
      if (!integration) return resolve();

      let creds;
      try {
        creds = JSON.parse(integration.creds || '{}');
      } catch (e) {
        return reject(e);
      }

      switch (integration.integration_type) {
        case 'google_calendar':
          const { google } = require('googleapis');
          const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/calendar'] });
          const calendar = google.calendar({ version: 'v3', auth });
          await calendar.events.insert({
            calendarId: 'primary',
            resource: { start: { dateTime: time }, end: { dateTime: new Date(new Date(time).getTime() + 3600000).toISOString() }, summary: details }
          });
          resolve();
          break;
        case 'calendly':
          // Assuming calendly-api package; adjust if different
          const Calendly = require('calendly-api'); // Install if needed
          const client = new Calendly({ apiKey: integration.api_key });
          await client.invitees.create({ event: creds.event_uri, name: details, time }); // Adjust fields
          resolve();
          break;
        default:
          resolve();
      }
    });
  });
}

module.exports = { fetchLeads, bookAppointment };
