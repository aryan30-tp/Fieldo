const mongoose = require('mongoose');

const RouteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  lastPing: { type: Number, default: Date.now },
  points: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    timestamp: { type: Number, required: true } // ⏱️ Holds the individual timestamp for map markers
  }]
});

// Ensures we only have ONE route document per employee per day
RouteSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Route', RouteSchema);