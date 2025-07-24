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

            let allContacts = [];
            let hasMore = true;
            let vidOffset = undefined;

            while (hasMore) {
              const response = await client.apiRequest({
                method: 'GET',
                path: `/contacts/v1/lists/${listId}/contacts/all`,
                qs: {
                  count: 100,
                  vidOffset,
                  property: ['firstname', 'lastname', 'phone', 'email']
                }
              });

              console.log("🔍 RAW HUBSPOT RESPONSE:", JSON.stringify(response.body, null, 2));

              const page = response.body.contacts || [];
              allContacts = allContacts.concat(page);

              hasMore = response.body['has-more'];
              vidOffset = response.body['vid-offset'];
            }

            console.log("📦 CONTACTS BEFORE MAPPING:", JSON.stringify(allContacts, null, 2));

            const contacts = allContacts.map(c => ({
              id: c.vid,
              name: `${c.properties.firstname?.value || ''} ${c.properties.lastname?.value || ''}`.trim() || 'Unnamed',
              phone: c.properties.phone?.value || '',
              email: c.properties.email?.value || ''
            }));

            console.log("✅ FINAL MAPPED LEADS:", contacts);

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
