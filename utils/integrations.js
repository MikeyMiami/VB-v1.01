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

              // ✅ Read and parse the stream response manually
              const chunks = [];
              for await (const chunk of response.body) {
                chunks.push(chunk);
              }
              const raw = Buffer.concat(chunks).toString('utf-8');

              let json;
              try {
                json = JSON.parse(raw);
              } catch (e) {
                console.error("❌ Error parsing HubSpot JSON:", raw);
                return reject(new Error('Failed to parse HubSpot response'));
              }

              console.log("🔍 PARSED HUBSPOT JSON:", JSON.stringify(json, null, 2));

              const page = json.contacts || [];
              allContacts = allContacts.concat(page);

              hasMore = json['has-more'];
              vidOffset = json['vid-offset'];
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
        console.error("❌ API error:", apiErr.message);
        return reject(apiErr);
      }
    });
  });
}

module.exports = { fetchLeads };
