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

        let allContacts = [];
        let hasMore = true;
        let vidOffset;

        // Step 1: Get all contact IDs from the list
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
          allContacts.push(...contacts);

          hasMore = json['has-more'];
          vidOffset = json['vid-offset'];
        }

        console.log("📥 TOTAL CONTACT IDs:", allContacts.map(c => c.vid));

        // Step 2: Fetch full details for each contact
        const leads = [];
        for (const contact of allContacts) {
          const vid = contact.vid;

          try {
            const fullContact = await client.crm.contacts.basicApi.getById(vid.toString(), [
              'firstname',
              'lastname',
              'email',
              'phone',
              'mobilephone',
              'hs_phone_number'
            ]);

            const props = fullContact?.body?.properties || {};
            const firstName = props.firstname || '';
            const lastName = props.lastname || '';
            const email = props.email || '';
            const name = `${firstName} ${lastName}`.trim() || 'Unnamed';
            const phone = props.phone || props.mobilephone || props.hs_phone_number || '';

            console.log(`📦 Fetched Contact ID ${vid}:`, props);

            leads.push({ id: vid, name, email, phone });
          } catch (err) {
            console.error(`❌ Failed to fetch full contact ${vid}:`, err.message);
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
