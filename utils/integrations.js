// VB-v1.01-main/utils/integrations.js
const db = require('../db');
const hubspot = require('@hubspot/api-client');

/**
 * Fetch leads from the specified integration (currently only 'hubspot').
 * @param {string|number} integrationId – the ID of the Integration record.
 * @param {string|number} listIdParam – the HubSpot list ID to pull contacts from.
 * @returns {Promise<Array>} Array of lead objects { id, name, email, phone, company }.
 */
async function fetchLeads(integrationId, listIdParam) {
  try {
    // 1) Load the integration record
    const { rows } = await db.query(
      'SELECT * FROM Integrations WHERE id = $1',
      [integrationId]
    );
    const integration = rows[0];
    if (!integration) {
      console.warn(`⚠️ No integration found with ID ${integrationId}`);
      return [];
    }

    // 2) Parse stored credentials (for future non-HubSpot types)
    let creds;
    try {
      creds = JSON.parse(integration.creds || '{}');
    } catch (e) {
      console.error('❌ Invalid JSON in integration.creds:', e.message);
      return [];
    }

    // 3) Only HubSpot is supported here
    if (integration.integration_type !== 'hubspot') {
      return [];
    }

    // 4) Validate list ID
    const listId = parseInt(listIdParam, 10);
    if (isNaN(listId)) {
      throw new Error('Invalid HubSpot list ID');
    }

    // 5) Initialize HubSpot client
    const client = new hubspot.Client({ accessToken: integration.api_key });

    // 6) Step 1: Retrieve all contact IDs from the list
    const contactIds = [];
    let hasMore = true;
    let vidOffset;
    while (hasMore) {
      const qs = { count: 100 };
      if (vidOffset !== undefined) qs.vidOffset = vidOffset;

      const response = await client.apiRequest({
        method: 'GET',
        path: `/contacts/v1/lists/${listId}/contacts/all`,
        qs,
      });

      // response.body is a stream—accumulate chunks
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');

      let json;
      try {
        json = JSON.parse(raw);
      } catch (e) {
        console.error('❌ Error parsing HubSpot response:', e);
        throw new Error('Failed to parse HubSpot list response');
      }

      const contacts = Array.isArray(json.contacts) ? json.contacts : [];
      for (const c of contacts) {
        if (c.vid) contactIds.push(c.vid);
      }

      hasMore = json['has-more'];
      vidOffset = json['vid-offset'];
    }
    console.log('📥 TOTAL CONTACT IDs:', contactIds);

    // 7) Step 2: Fetch full contact details via V3 API
    const leads = [];
    for (const contactId of contactIds) {
      try {
        const contactDetails = await client.crm.contacts.basicApi.getById(
          contactId,
          ['firstname', 'lastname', 'email', 'phone', 'company']
        );
        const props = contactDetails.properties || {};
        console.log(`📦 Fetched Contact ID ${contactId}:`, props);

        const name = `${props.firstname || ''} ${props.lastname || ''}`.trim() || 'Unnamed';
        const email = props.email || '';
        const phone = props.phone || '';
        const company = props.company || '';

        leads.push({ id: contactId, name, email, phone, company });
      } catch (err) {
        console.warn(`⚠️ Failed to fetch contact ${contactId}:`, err.message);
      }
    }
    console.log('✅ FINAL MAPPED LEADS:', leads);

    return leads;

  } catch (err) {
    console.error('❌ Error in fetchLeads:', err);
    throw err;
  }
}

module.exports = { fetchLeads };

