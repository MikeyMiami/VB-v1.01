// VB-v1.01-main/utils/hubspot.js
const axios = require('axios');

async function postNoteToHubSpot(apiKey, contactId, noteBody) {
  try {
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/notes',
      {
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: noteBody,
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 3, // Contact association
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Note successfully created in HubSpot');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to create note in HubSpot:', {
      status: error.response?.status,
      message: error.message,
      body: error.response?.data
    });
    throw error;
  }
}

module.exports = { postNoteToHubSpot };
