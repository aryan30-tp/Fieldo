const mongoose = require('mongoose');

const VisitSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  employeeName: { type: String, required: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  clientName: { type: String, required: true, index: true }, // Indexed for HR search
  summary: { type: String, required: true },
  lat: Number,
  lng: Number,
  timestamp: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Visit', VisitSchema);