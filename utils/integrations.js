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

        while (hasMore) {
          const qs = {
            count: 100,
            property: ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'hs_phone_number']
          };
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

        console.log("📥 TOTAL CONTACTS:", allContacts.length);

        const leads = allContacts.map(contact => {
          const vid = contact.vid;
          const props = contact.properties || {};

          console.log(`📦 PROPERTIES FOR CONTACT ID ${vid}:`, props);

          const firstName = props.firstname?.value || '';
          const lastName = props.lastname?.value || '';
          const email = props.email?.value || '';
          const name = `${firstName} ${lastName}`.trim() || 'Unnamed';

          const phone =
            props.phone?.value ||
            props.mobilephone?.value ||
            props.hs_phone_number?.value ||
            '';

          return {
            id: vid,
            name,
            email,
            phone
          };
        });

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
