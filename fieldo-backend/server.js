const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- MONGODB CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || "your_fallback_atlas_string_here";
mongoose.connect(MONGO_URI)
  .then(() => console.log("📦 Connected to MongoDB Atlas successfully!"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- MONGOOSE SCHEMA ---
const RouteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  lastPing: { type: Number, default: Date.now },
  points: [{
    lat: Number,
    lng: Number,
    timestamp: Number
  }]
});

// Compound index to quickly find a user's route for a specific day
RouteSchema.index({ userId: 1, date: 1 }, { unique: true });
const Route = mongoose.model('Route', RouteSchema);

// In-memory buffer to batch writes and save database performance
const locationBuffers = {};

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('register', (data) => {
    socket.userId = data.userId;
    socket.role = data.role;
    console.log(`🆔 Registered ${data.role}: ${data.userId}`);
  });

  // 🛰️ Real-Time GPS Stream Event
  socket.on('location-update', async (data) => {
    const { userId, name, lat, lng, timestamp } = data;
    const today = new Date().toISOString().split('T')[0];

    // 1. Broadcast instantly to HR web portal via WebSockets (Zero DB delay)
    socket.broadcast.emit('hr-location-stream', { userId, name, lat, lng, timestamp });

    // 2. Client-Side / Server-Side Batching to MongoDB
    if (!locationBuffers[userId]) {
      locationBuffers[userId] = [];
    }
    locationBuffers[userId].push({ lat, lng, timestamp });

    // Every 5 pings (roughly 15-30 seconds), flush the buffer to MongoDB in bulk
    if (locationBuffers[userId].length >= 5) {
      const pointsToFlush = [...locationBuffers[userId]];
      locationBuffers[userId] = []; // Clear buffer immediately to prevent duplicates

      try {
        await Route.updateOne(
          { userId, date: today },
          {
            $set: { name, lastPing: timestamp, isActive: true },
            $push: { points: { $each: pointsToFlush } }
          },
          { upsert: true } // Create document if it doesn't exist yet
        );
        console.log(`💾 Flushed ${pointsToFlush.length} points to Mongo for ${name}`);
      } catch (err) {
        console.error("❌ Failed to save points to Mongo:", err);
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      socket.broadcast.emit('employee-disconnected', { userId: socket.userId });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));