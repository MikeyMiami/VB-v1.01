const hubspot = require('@hubspot/api-client');
const db = require('../db');

async function fetchLeads(integrationId, listId) {
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

      switch (integration.integration_type) {
        case 'hubspot':
          const client = new hubspot.Client({ accessToken: integration.api_key });

          try {
            const result = await client.apiRequest({
              method: 'GET',
              path: `/contacts/v1/lists/${listId}/contacts/all`,
              qs: { count: 100 }
            });

            const contacts = result.body.contacts || [];
            console.log("📦 CONTACTS BEFORE MAPPING:", contacts);

            const leads = contacts.map(contact => {
              const id = contact.vid;
              const properties = contact.properties || {};

              // ✅ Attempt to get phone number from properties
              const phone = properties.phone?.value || '';

              // ✅ Attempt to get email from identity profiles
              const identities = contact["identity-profiles"]?.[0]?.identities || [];
              const email = identities.find(i => i.type === "EMAIL")?.value || '';

              // ✅ Attempt to get full name or fallback name
              const fullName = identities.find(i => i.type === "FULLNAME")?.value;
              const fallbackName = identities.find(i => i.type === "FIRSTNAME")?.value;
              const name = fullName || fallbackName || "Unnamed";

              return {
                id,
                name,
                email,
                phone
              };
            });

            console.log("✅ FINAL MAPPED LEADS:", leads);
            return resolve(leads);

          } catch (apiErr) {
            console.error("❌ HubSpot API Error:", apiErr.message || apiErr);
            return reject(apiErr);
          }

        default:
          return resolve([]);
      }
    });
  });
}

module.exports = { fetchLeads };
