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


// --- 1. EMPLOYEE ROSTER & MANAGEMENT ENDPOINTS ---

// Sync Employee Profile on Login
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

// Search Employees / Fetch Master Roster (Fuzzy Text Match)
app.get('/api/employees/search', async (req, res) => {
  const { q } = req.query;
  try {
    let filter = {};
    if (q) {
      filter = { $text: { $search: q } };
    }
    const employees = await Employee.find(filter).limit(50);
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ error: "Employee search failed" });
  }
});


// --- 2. ATTENDANCE & ANALYTICS ENDPOINTS ---

// Fetch Attendance History across dates for a specific user
app.get('/api/attendance/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // Aggregates route sessions to determine dates worked and last active milestones
    const sessions = await Route.find({ userId }).select('date points lastPing').sort({ date: -1 });
    
    const logs = sessions.map(session => {
      const firstPoint = session.points[0];
      const startTime = firstPoint ? firstPoint.timestamp : null;
      const endTime = session.lastPing;
      
      // Calculate total duration of active session tracking in hours
      const durationHours = startTime && endTime ? ((endTime - startTime) / 3600000).toFixed(2) : 0;

      return {
        date: session.date,
        startedAt: startTime,
        endedAt: endTime,
        hoursLogged: parseFloat(durationHours)
      };
    });

    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: "Failed to compile attendance metrics" });
  }
});


// --- 3. CRM VISIT NOTES & MEETING SUMMARIES ---

// Create a client meeting note submission
app.post('/api/visits', async (req, res) => {
  const { userId, employeeName, clientName, summary, lat, lng } = req.body;
  const today = new Date().toISOString().split('T')[0];
  try {
    const newVisit = new Visit({
      userId,
      employeeName,
      date: today,
      clientName,
      summary,
      lat,
      lng
    });
    await newVisit.save();
    res.status(201).json(newVisit);
  } catch (err) {
    res.status(500).json({ error: "Failed to register visit note summary" });
  }
});

// Fetch all client notes for HR view (can filter by date or employee)
app.get('/api/visits', async (req, res) => {
  const { date, userId } = req.query;
  try {
    let filter = {};
    if (date) filter.date = date;
    if (userId) filter.userId = userId;

    const notes = await Visit.find(filter).sort({ timestamp: -1 });
    res.status(200).json(notes);
  } catch (err) {
    res.status(500).json({ error: "Failed to pull CRM notes" });
  }
});


// --- 4. MAP REPLAY & TIME-SERIES POINTS ---

// Fetch specific daily route array (Fulfills Route Replay with sub-point timestamps)
app.get('/api/routes/:userId/:date', async (req, res) => {
  const { userId, date } = req.params;
  try {
    const route = await Route.findOne({ userId, date });
    if (!route) {
      return res.status(200).json({ userId, date, points: [] });
    }
    res.status(200).json(route);
  } catch (err) {
    res.status(500).json({ error: "Error pulling historic data stream" });
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

    // Relay immediately across websocket to connected clients
    socket.broadcast.emit('hr-location-stream', { userId, name, lat, lng, timestamp });

    // Internal memory buffer collection
    if (!locationBuffers[userId]) locationBuffers[userId] = [];
    locationBuffers[userId].push({ lat, lng, timestamp });

    // Flush batch to Mongo cluster every 5 points to save network payload weight
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
        console.error("❌ Batch update flush crash:", err);
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
server.listen(PORT, () => console.log(`🚀 Complete Enterprise API running on port ${PORT}`));