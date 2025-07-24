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

        console.log("📥 TOTAL CONTACTS:", allContacts.length);

        const leads = allContacts.map(contact => {
          const vid = contact.vid;

          const identityProfile = contact['identity-profiles']?.[0];
          const emailIdentity = identityProfile?.identities?.find(i => i.type === 'EMAIL');
          const email = emailIdentity?.value || '';

          const firstName = contact.properties?.firstname?.value || '';
          const lastName = contact.properties?.lastname?.value || '';
          const name = `${firstName} ${lastName}`.trim() || 'Unnamed';

          // 🔍 DEBUG: Print all properties to check for phone-related keys
          console.log(`📦 PROPERTIES FOR CONTACT ID ${vid}:`, contact.properties);

          // Try multiple phone-related fields
          const phone =
            contact.properties?.phone?.value ||
            contact.properties?.mobilephone?.value ||
            contact.properties?.phone_number?.value ||
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
