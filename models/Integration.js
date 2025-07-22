const mongoose = require('mongoose');
const encryption = require('mongoose-encryption');

const integrationSchema = new mongoose.Schema({
  userId: String,
  api_key: String, // Encrypted
  integration_type: String, // 'hubspot', 'salesforce', 'google_sheets', 'google_calendar', 'calendly'
  last_tested: Date,
  test_status: String,
  creds: Object, // Additional creds (e.g., username, sheet_id, event_uri) - object for flexibility
  createdDate: { type: Date, default: Date.now },
  modifiedDate: { type: Date, default: Date.now }
});

// Encrypt sensitive fields
const encKey = process.env.ENC_KEY || '32-byte-base64-key'; // Generate a secure key
const sigKey = process.env.SIG_KEY || '64-byte-base64-key';
integrationSchema.plugin(encryption, { encryptionKey: encKey, signingKey: sigKey, encryptedFields: ['api_key', 'creds'] });

module.exports = mongoose.model('Integration', integrationSchema);
