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

        // Step 1: Get contact IDs from list
        const contactIds = [];
        let hasMore = true;
        let vidOffset;

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

          const contacts = json.contacts || [];
          for (const contact of contacts) {
            if (contact.vid) contactIds.push(contact.vid);
          }

          hasMore = json['has-more'];
          vidOffset = json['vid-offset'];
        }

        console.log("📥 TOTAL CONTACT IDs:", contactIds);

        // Step 2: Fetch full contact details using V3 API
        const leads = [];

        for (const contactId of contactIds) {
          try {
            const contactDetails = await client.crm.contacts.basicApi.getById(
              contactId,
              ['firstname', 'lastname', 'email', 'phone'] // ✅ Explicitly request these
            );

            const props = contactDetails?.properties || {};
            console.log(`📦 Fetched Contact ID ${contactId}:`, props);

            const name = `${props.firstname || ''} ${props.lastname || ''}`.trim() || 'Unnamed';
            const email = props.email || '';
            const phone = props.phone || '';

            leads.push({
              id: contactId,
              name,
              email,
              phone
            });
          } catch (err) {
            console.warn(`⚠️ Failed to fetch contact ID ${contactId}:`, err.message);
          }
        }

        console.log("✅ FINAL MAPPED LEADS:", leads);
        return resolve(leads);
      } catch (apiErr) {
        console.error("❌ HubSpot API error:", apiErr.message);
        return reject(apiErr);
      }
    });
  });
}

module.exports = { fetchLeads };
