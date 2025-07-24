// VB-v1.01-main/utils/hubspot.js
const hubspot = require('@hubspot/api-client');

async function postNoteToHubSpot(apiKey, contactId, content) {
  try {
    const client = new hubspot.Client({ accessToken: apiKey });

    const engagementNote = {
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: content,
        hs_engagement_type: 'NOTE'
      },
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
        }
      ]
    };

    const response = await client.crm.objects.notes.basicApi.create({ properties: engagementNote.properties, associations: engagementNote.associations });
    console.log('📝 Note created in HubSpot:', response.id);
  } catch (err) {
    console.error('❌ Failed to create note in HubSpot:', err.message);
  }
}

module.exports = { postNoteToHubSpot };
