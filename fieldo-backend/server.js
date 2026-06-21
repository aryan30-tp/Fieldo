const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// Import Schemas
const Route = require('./models/Route');
const Visit = require('./models/Visit');
const Employee = require('./models/Employee');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- MONGODB CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/fieldo";
mongoose.connect(MONGO_URI)
  .then(() => console.log("📦 Monolithic Backend: Connected to MongoDB Atlas!"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- HTTP REST ENDPOINTS FOR HR & EMPLOYEE CLIENTS ---

// 1. Sync Employee Profile on Login
app.post('/api/employees/sync', async (req, res) => {
  const { userId, name, email } = req.body;
  try {
    const employee = await Employee.findOneAndUpdate(
      { userId },
      { name, email },
      { upsert: true, new: true }
    );
    res.status(200).json(employee);
  } catch (err) {
    res.status(500).json({ error: "Failed to sync profile" });
  }
});

// 2. Search Employees (HR Roster Lookup)
app.get('/api/employees/search', async (req, res) => {
  const { q } = req.query; // Query string param
  try {
    let filter = {};
    if (q) filter = { $text: { $search: q } };
    const employees = await Employee.find(filter).limit(20);
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ error: "Employee search failed" });
  }
});

// 3. Post a Client Visit Note (Employee Form Submission)
app.post('/api/visits', async (req, res) => {
  const { userId, employeeName, clientName, summary, lat, lng } = req.body;
  const today = new Date().toISOString().split('T')[0];
  try {
    const newVisit = new Visit({ userId, employeeName, date: today, clientName, summary, lat, lng });
    await newVisit.save();
    res.status(201).json(newVisit);
  } catch (err) {
    res.status(500).json({ error: "Failed to save visit note" });
  }
});

// 4. Fetch Historic Route Points (HR Route Replay & Gaps View)
app.get('/api/routes/:userId/:date', async (req, res) => {
  const { userId, date } = req.params;
  try {
    const route = await Route.findOne({ userId, date });
    res.status(200).json(route || { points: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch route history" });
  }
});

// --- WEBSOCKET REAL-TIME PIPELINE ---
const locationBuffers = {};

io.on('connection', (socket) => {
  console.log(`🔌 Socket linked: ${socket.id}`);

  socket.on('register', (data) => {
    socket.userId = data.userId;
    console.log(`🆔 Socket registered user: ${data.userId}`);
  });

  socket.on('location-update', async (data) => {
    const { userId, name, lat, lng, timestamp } = data;
    const today = new Date().toISOString().split('T')[0];

    // Stream instantly to HR Portal (Zero database lag)
    socket.broadcast.emit('hr-location-stream', { userId, name, lat, lng, timestamp });

    // Server-side batch buffering 
    if (!locationBuffers[userId]) locationBuffers[userId] = [];
    locationBuffers[userId].push({ lat, lng, timestamp });

    // Flush batch write to Mongo database every 5 iterations
    if (locationBuffers[userId].length >= 5) {
      const pointsToFlush = [...locationBuffers[userId]];
      locationBuffers[userId] = [];

      try {
        await Route.updateOne(
          { userId, date: today },
          {
            $set: { name, lastPing: timestamp },
            $push: { points: { $each: pointsToFlush } }
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("❌ Batch write update failed:", err);
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
server.listen(PORT, () => console.log(`🚀 Monolithic API running on port ${PORT}`));