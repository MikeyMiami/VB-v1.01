const mongoose = require('mongoose');

const dashboardStatSchema = new mongoose.Schema({
  botId: String,
  appointments_set: String,
  conversation_count: Number,
  date: String,
  dials_count: Number,
  createdDate: { type: Date, default: Date.now },
  modifiedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DashboardStat', dashboardStatSchema);
