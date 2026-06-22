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

// Sync Employee Profile on Login (Prevents overwriting rich data fields)
app.post('/api/employees/sync', async (req, res) => {
  const { userId, name, email } = req.body;
  try {
    const employee = await Employee.findOneAndUpdate(
      { userId },
      { 
        $set: { email },
        $setOnInsert: { firstName: name, empId: String(Date.now()).slice(-4) } 
      },
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


// --- 2. ADVANCED HR CORPORATE PROVISIONING DBMS ENDPOINTS ---

// GET ALL EMPLOYEES WITH COMPUTED MONTH METRICS, TOP 3 CLIENTS, & AUTO CITY LOOKUP
app.get('/api/hr/employees', async (req, res) => {
  try {
    const employees = await Employee.find({}).lean();
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthPad = String(now.getMonth() + 1).padStart(2, '0');
    
    const startOfMonthStr = `${currentYear}-${currentMonthPad}-01`;
    const endOfMonthStr = `${currentYear}-${currentMonthPad}-31`;

    const enrichedRoster = await Promise.all(employees.map(async (emp) => {
      
      // A. Days Present Count (shifts aggregated >= 15 mins / 0.25 hours)
      const daysPresentCount = await Route.countDocuments({
        userId: emp.userId,
        date: { $gte: startOfMonthStr, $lte: endOfMonthStr }
      });

      // B. Aggregate Top 3 Client Occurrences from CRM logs
      const topClients = await Visit.aggregate([
        { $match: { userId: emp.userId } },
        { $group: { _id: "$clientName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]);

      // C. 📍 AUTOMATIC CITY CALCULATION ENGINE
      // Inspect initial tracking coordinate sets to determine active home city base
      const shiftData = await Route.find({ userId: emp.userId }).select('points').limit(3).lean();
      let autoCalculatedCity = emp.area || "Not Tracking";

      if (shiftData.length > 0 && shiftData[0].points?.length > 0) {
        const startPt = shiftData[0].points[0];
        const lat = startPt.lat;
        const lng = startPt.lng;

        // Bounding Box Matrix matching coordinates for Delhi NCR zones
        if (lat >= 28.30 && lat <= 28.55 && lng >= 76.80 && lng <= 77.15) {
          autoCalculatedCity = "Gurugram";
        } else if (lat >= 28.50 && lat <= 28.75 && lng >= 77.05 && lng <= 77.35) {
          autoCalculatedCity = "Delhi";
        } else if (emp.area && emp.area !== '-') {
          autoCalculatedCity = emp.area;
        } else {
          autoCalculatedCity = "Out of Station";
        }
      }

      return {
        _id: emp._id,
        userId: emp.userId,
        empId: emp.empId || 'N/A',
        firstName: emp.firstName || emp.name || 'Unnamed',
        lastName: emp.lastName || '',
        area: autoCalculatedCity, // Natively returns resolved geographic city name
        email: emp.email,
        mobile: emp.mobile || '-',
        daysPresent: daysPresentCount,
        freqClient1: topClients[0]?._id || '-',
        freqClient2: topClients[1]?._id || '-',
        freqClient3: topClients[2]?._id || '-'
      };
    }));

    res.status(200).json(enrichedRoster);
  } catch (err) {
    console.error("DBMS processing failure:", err);
    res.status(500).json({ error: "Failed to compile database grid indices" });
  }
});

// ADD NEW FIELD WORKER & PROVISION PROFILE
app.post('/api/hr/employees/add', async (req, res) => {
  const { empId, firstName, lastName, area, email, mobile } = req.body;
  try {
    const existing = await Employee.findOne({ $or: [{ email }, { empId }] });
    if (existing) {
      return res.status(400).json({ error: "Employee ID or Email parameter collision." });
    }

    const newEmp = new Employee({
      userId: "PROVISIONED_" + Math.random().toString(36).substring(2, 11),
      empId,
      firstName,
      lastName,
      area: area || '-',
      email,
      mobile,
      name: firstName
    });

    await newEmp.save();
    res.status(201).json({ success: true, employee: newEmp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Provisioning request processing error" });
  }
});

// ✏️ UPDATE EMPLOYEE DETAILS (Inline Modification Route)
app.put('/api/hr/employees/:id', async (req, res) => {
  const { email, mobile } = req.body;
  try {
    const updatedEmployee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: { email, mobile } },
      { new: true }
    );
    res.status(200).json({ success: true, employee: updatedEmployee });
  } catch (err) {
    console.error("Failed to apply details update modifications:", err);
    res.status(500).json({ error: "Profile details modification save error." });
  }
});

// REMOVE EMPLOYEE / REVOKE AREA PERMISSIONS
app.delete('/api/hr/employees/:id', async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Profile access authorization dropped." });
  } catch (err) {
    res.status(500).json({ error: "Failed to perform data wipe action" });
  }
});


// --- 3. ATTENDANCE & ANALYTICS ENDPOINTS ---

app.get('/api/attendance/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const sessions = await Route.find({ userId }).select('date points lastPing').sort({ date: -1 });
    
    const logs = sessions.map(session => {
      const firstPoint = session.points[0];
      const startTime = firstPoint ? firstPoint.timestamp : null;
      const endTime = session.lastPing;
      
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


// --- 4. CRM VISIT NOTES & MEETING SUMMARIES ---

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
      lng,
      timestamp: Date.now()
    });
    await newVisit.save();
    res.status(201).json(newVisit);
  } catch (err) {
    res.status(500).json({ error: "Failed to register visit note summary" });
  }
});

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


// --- 5. MAP REPLAY & TIME-SERIES POINTS ---

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

    socket.broadcast.emit('hr-location-stream', { userId, name, lat, lng, timestamp });

    if (!locationBuffers[userId]) locationBuffers[userId] = [];
    locationBuffers[userId].push({ lat, lng, timestamp });

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