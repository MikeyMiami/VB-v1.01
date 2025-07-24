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
        if (integration.integration_type !== 'hubspot') {
          return resolve([]);
        }

        const client = new hubspot.Client({ accessToken: integration.api_key });
        const listId = parseInt(listIdParam);
        if (isNaN(listId)) return reject(new Error('Invalid HubSpot list ID'));

        let allContactIds = [];
        let hasMore = true;
        let vidOffset;

        // STEP 1: Get all contact IDs in the list
        while (hasMore) {
          const qs = { count: 100 };
          if (vidOffset !== undefined) qs.vidOffset = vidOffset;

          const response = await client.apiRequest({
            method: 'GET',
            path: `/contacts/v1/lists/${listId}/contacts/all`,
            qs
          });

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
            return reject(new Error('Failed to parse HubSpot list response'));
          }

          const ids = (json.contacts || []).map(c => c.vid);
          allContactIds.push(...ids);

          hasMore = json['has-more'];
          vidOffset = json['vid-offset'];
        }

        console.log("📥 TOTAL CONTACT IDs:", allContactIds);

        // STEP 2: Fetch full data for each contact
        const results = [];
        for (const contactId of allContactIds) {
          try {
            const contact = await client.crm.contacts.basicApi.getById(contactId.toString(), [
              'firstname',
              'lastname',
              'email',
              'phone'
            ]);

            const props = contact?.body?.properties || {};
            const name = `${props.firstname || ''} ${props.lastname || ''}`.trim();
            const email = props.email || '';
            const phone = props.phone || '';

            results.push({
              id: contactId,
              name: name || 'Unnamed',
              email,
              phone
            });
          } catch (fetchErr) {
            console.warn(`⚠️ Could not fetch contact ${contactId}:`, fetchErr.message);
          }
        }

        console.log("✅ FINAL MAPPED LEADS:", results);
        return resolve(results);
      } catch (apiErr) {
        console.error("❌ HubSpot API error:", apiErr.message);
        return reject(apiErr);
      }
    });
  });
}

module.exports = { fetchLeads };
