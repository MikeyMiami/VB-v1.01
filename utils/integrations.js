// VB-v1.01-main/utils/integrations.js
const db = require('../db');
const hubspot = require('@hubspot/api-client');

async function fetchLeads(integrationId, listIdParam) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM Integrations WHERE id = ?`, [integrationId], async (err, integration) => {
      if (err) return reject(err);
      if (!integration) return resolve([]);

      let creds;
      try {
        creds = JSON.parse(integration.creds || '{}');
      } catch (e) {
        return reject(e);
      }

      try {
        switch (integration.integration_type) {
          case 'hubspot':
            const client = new hubspot.Client({ accessToken: integration.api_key });

            const listId = parseInt(listIdParam);
            if (isNaN(listId)) return reject(new Error('Invalid HubSpot list ID'));

            const response = await client.marketing.contacts.lists.getContactsInList(listId, {
              count: 100,
              property: ['firstname', 'lastname', 'phone', 'email']
            });

            const contacts = (response.results || []).map(c => ({
              id: c.vid,
              name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim(),
              phone: c.properties.phone,
              email: c.properties.email
            }));

            return resolve(contacts);

          default:
            return resolve([]);
        }
      } catch (apiErr) {
        return reject(apiErr);
      }
    });
  });
}

module.exports = { fetchLeads };
