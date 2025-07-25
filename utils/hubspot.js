// utils/hubspot.js

const axios = require('axios');

/**
 * Creates a note in HubSpot and associates it with a contact.
 * @param {string} apiKey - The private app token (bearer token).
 * @param {string} contactId - The HubSpot contact ID to associate the note with.
 * @param {string} noteContent - The content of the note.
 */
async function postNoteToHubSpot(apiKey, contactId, noteContent) {
  try {
    // Step 1: Create the note object
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

    // Step 2: Associate the note to the contact
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

    console.log('✅ Note successfully created and associated with contact ID:', contactId);
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
