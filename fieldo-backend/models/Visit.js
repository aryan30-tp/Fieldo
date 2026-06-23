const mongoose = require('mongoose');

const VisitSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  employeeName: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  clientName: { type: String, required: true }, // Company Where He Went
  contactPerson: { type: String, required: true }, // Name of the person met
  personPosition: { type: String, default: '-' }, // Position (Optional fallback)
  personMobile: { type: String, required: true }, // Mobile Number of the contact
  summary: { type: String, required: true }, // Summary of discussion
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  timestamp: { type: Number, required: true }
});

module.exports = mongoose.model('Visit', VisitSchema);