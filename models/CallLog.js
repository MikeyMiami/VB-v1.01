const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  botId: String,
  call_date: Date,
  call_duration: Number,
  call_outcome: String,
  category_label: String,
  contact_name: String,
  lead_source: String,
  notes: String,
  recording: String,
  createdDate: { type: Date, default: Date.now },
  modifiedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CallLog', callLogSchema);
