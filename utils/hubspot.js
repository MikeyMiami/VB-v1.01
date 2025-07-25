const axios = require('axios');

async function postNoteToHubSpot(apiKey, contactId, noteContent) {
  try {
    // 1. Create the note
    const noteResponse = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/notes',
      {
        properties: {
          hs_note_body: noteContent,
        }
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const noteId = noteResponse.data.id;

    // 2. Associate the note with the contact
    await axios.put(
      `https://api.hubapi.com/crm/v3/objects/notes/${noteId}/associations/contacts/${contactId}/note_to_contact`,
      {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Note created and associated successfully.');
  } catch (err) {
    console.error('❌ Failed to create or associate note in HubSpot:', {
      status: err.response?.status,
      message: err.message,
      body: err.response?.data
    });
    throw err;
  }
}

module.exports = { postNoteToHubSpot };

module.exports = { postNoteToHubSpot };
