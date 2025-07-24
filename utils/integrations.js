async function fetchLeads(integrationId, listId) {
  return new Promise((resolve, reject) => {
    const db = require('../db');
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
          const hubspot = require('@hubspot/api-client');
          const client = new hubspot.Client({ accessToken: integration.api_key });

          try {
            const listContactsRes = await client.apiRequest({
              method: 'GET',
              path: `/contacts/v1/lists/${listId}/contacts/all`,
              qs: {
                count: 100
              }
            });

            const contactIds = (listContactsRes.body.contacts || []).map(c => c.vid);
            console.log('📥 TOTAL CONTACT IDs:', contactIds);

            const leads = [];

            for (const id of contactIds) {
              try {
                const contact = await client.crm.contacts.basicApi.getById(id, [
                  "firstname",
                  "lastname",
                  "email",
                  "phone",
                  "mobilephone"
                ]);

                leads.push({
                  id: contact.id,
                  name: `${contact.properties.firstname || ""} ${contact.properties.lastname || ""}`.trim() || "Unnamed",
                  email: contact.properties.email || "",
                  phone: contact.properties.phone || contact.properties.mobilephone || ""
                });

              } catch (innerErr) {
                console.error(`❌ Error fetching contact ID ${id}:`, innerErr.message || innerErr);
              }
            }

            console.log('✅ FINAL MAPPED LEADS:', leads);
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
