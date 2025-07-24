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
        if (integration.integration_type !== 'hubspot') {
          return resolve([]);
        }

        const client = new hubspot.Client({ accessToken: integration.api_key });
        const listId = parseInt(listIdParam);
        if (isNaN(listId)) return reject(new Error('Invalid HubSpot list ID'));

        // Step 1: Get all contact IDs from the list
        const listRes = await client.apiRequest({
          method: 'GET',
          path: `/contacts/v1/lists/${listId}/contacts/all`,
          qs: { count: 100 }
        });

        const chunks = [];
        for await (const chunk of listRes.body) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf-8');
        const parsed = JSON.parse(raw);

        const contactIds = parsed.contacts.map(c => c.vid);
        console.log("📥 TOTAL CONTACT IDs:", contactIds);

        // Step 2: Use v3 to fetch full property details for each contact
        const leads = [];

        for (const id of contactIds) {
          try {
            const { body } = await client.apiRequest({
              method: 'GET',
              path: `/crm/v3/objects/contacts/${id}`,
              qs: {
                properties: ['firstname', 'lastname', 'email', 'phone', 'company']
              }
            });

            const props = body.properties || {};
            console.log(`📦 Fetched Contact ID ${id}:`, props);

            leads.push({
              id,
              name: `${props.firstname || ''} ${props.lastname || ''}`.trim() || 'Unnamed',
              email: props.email || '',
              phone: props.phone || '',
              company: props.company || ''
            });
          } catch (err) {
            console.error(`❌ Failed to fetch contact ${id}:`, err.message);
          }
        }

        console.log("✅ FINAL MAPPED LEADS:", leads);
        resolve(leads);
      } catch (apiErr) {
        console.error("❌ HubSpot API error:", apiErr.message);
        reject(apiErr);
      }
    });
  });
}

module.exports = { fetchLeads };
