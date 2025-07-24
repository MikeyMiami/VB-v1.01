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

        // 1. Fetch contacts from the list
        const listResp = await client.apiRequest({
          method: 'GET',
          path: `/contacts/v1/lists/${listId}/contacts/all`,
          qs: { count: 100 }
        });

        const chunks = [];
        for await (const chunk of listResp.body) {
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf-8');
        const json = JSON.parse(raw);
        const contactList = json.contacts || [];

        console.log("📥 TOTAL CONTACT IDs:", contactList.map(c => c.vid));

        // 2. Fetch full contact records (with company associations)
        const leads = [];

        for (const contact of contactList) {
          const contactId = contact.vid;

          // a. Fetch full contact data
          const contactData = await client.crm.contacts.basicApi.getById(contactId.toString(), {
            properties: ['firstname', 'lastname', 'email', 'phone']
          });

          const props = contactData.properties || {};
          const name = `${props.firstname || ''} ${props.lastname || ''}`.trim() || 'Unnamed';
          const email = props.email || '';
          const phone = props.phone || '';

          // b. Fetch associated company (if any)
          let companyName = '';
          try {
            const associations = await client.crm.contacts.associationsApi.getAll(contactId.toString(), 'companies');
            const companyIds = associations.results.map(a => a.id);

            if (companyIds.length > 0) {
              const company = await client.crm.companies.basicApi.getById(companyIds[0], {
                properties: ['name', 'domain']
              });

              companyName = company.properties?.name || '';
            }
          } catch (e) {
            console.warn(`⚠️ No company for contact ${contactId}`);
          }

          leads.push({
            id: contactId,
            name,
            email,
            phone,
            company: companyName
          });
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
