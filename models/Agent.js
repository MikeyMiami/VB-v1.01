const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // From Bubble user slug
  name: String,
  prompt_script: String,
  dial_limit: Number,
  max_calls_per_contact: Number,
  call_time_start: Number, // e.g., 9 (9AM)
  call_time_end: Number, // e.g., 17 (5PM)
  call_days: [String], // ['monday', 'tuesday', ...]
  double_dial_no_answer: Boolean,
  active: { type: Boolean, default: false },
  integrationId: String, // Reference to Integration _id
  createdDate: { type: Date, default: Date.now },
  modifiedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Agent', agentSchema);
