const Integration = require('../models/Integration');

async function fetchLeads(integrationId) {
  const integration = await Integration.findById(integrationId);
  if (!integration) return [];

  switch (integration.integration_type) {
    case 'hubspot':
      const hubspot = require('@hubspot/api-client');
      const client = new hubspot.Client({ accessToken: integration.api_key });
      const { results } = await client.crm.contacts.basicApi.getPage();
      return results.map(c => ({ phone: c.properties.phone, id: c.id }));
    case 'salesforce':
      const jsforce = require('jsforce');
      const conn = new jsforce.Connection();
      await conn.login(integration.creds.username, integration.api_key); // Assume api_key is password+token
      const leads = await conn.query('SELECT Id, Phone FROM Lead');
      return leads.records.map(l => ({ phone: l.Phone, id: l.Id }));
    case 'google_sheets':
      const { GoogleSpreadsheet } = require('google-spreadsheet');
      const doc = new GoogleSpreadsheet(integration.creds.sheet_id);
      await doc.useServiceAccountAuth({ client_email: integration.creds.client_email, private_key: integration.creds.private_key });
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];
      const rows = await sheet.getRows();
      return rows.map(r => ({ phone: r.phone, id: r._rowNumber })); // Assume columns like 'phone'
    default:
      return [];
  }
}

async function bookAppointment(integrationId, time, details) {
  const integration = await Integration.findById(integrationId);
  if (!integration) return;

  switch (integration.integration_type) {
    case 'google_calendar':
      const { google } = require('googleapis');
      const auth = new google.auth.GoogleAuth({ credentials: integration.creds, scopes: ['https://www.googleapis.com/auth/calendar'] });
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.insert({
        calendarId: 'primary',
        resource: { start: { dateTime: time }, end: { dateTime: new Date(new Date(time).getTime() + 3600000).toISOString() }, summary: details }
      });
      break;
    case 'calendly':
      // Assuming calendly-api package; adjust if different
      const Calendly = require('calendly-api'); // Install if needed
      const client = new Calendly({ apiKey: integration.api_key });
      await client.invitees.create({ event: integration.creds.event_uri, name: details.name || 'Appointment', time }); // Adjust fields
      break;
  }
}

module.exports = { fetchLeads, bookAppointment };
