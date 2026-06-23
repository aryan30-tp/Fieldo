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
      
      // A. Days Present Count (shifts aggregated using accurate gaps and >= 4.0 hours threshold)
      const monthlyShifts = await Route.find({
        userId: emp.userId,
        date: { $gte: startOfMonthStr, $lte: endOfMonthStr }
      }).lean();

      let daysPresentCount = 0;

      monthlyShifts.forEach(session => {
        if (session.points && session.points.length >= 2) {
          const sortedPoints = [...session.points].sort((a, b) => a.timestamp - b.timestamp);
          let activeTrackingMs = 0;

          for (let i = 1; i < sortedPoints.length; i++) {
            const delta = sortedPoints[i].timestamp - sortedPoints[i - 1].timestamp;
            // Accumulate time if updates are consecutive (within 5 minutes)
            if (delta > 0 && delta <= 5 * 60 * 1000) {
              activeTrackingMs += delta;
            }
          }

          const activeHours = activeTrackingMs / 3600000;
          
          // 🟢 NEW ACCURATE THRESHOLD: Must achieve at least 4.0 active hours to be counted as present
          if (activeHours >= 4.0) {
            daysPresentCount++;
          }
        }
      });

      // B. Aggregate Top 3 Client Occurrences from CRM logs
      const topClients = await Visit.aggregate([
        { $match: { userId: emp.userId } },
        { $group: { _id: "$clientName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]);

      // C. 📍 AUTOMATIC CITY CALCULATION ENGINE
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
        area: autoCalculatedCity,
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

// 🟢 ACCURATE ATTENDANCE ENGINE: Aggregates real operational duration by ignoring large inactive gaps
app.get('/api/attendance/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const sessions = await Route.find({ userId }).sort({ date: -1 }).lean();
    
    const logs = sessions.map(session => {
      if (!session.points || session.points.length < 2) {
        return { date: session.date, startedAt: null, endedAt: session.lastPing, hoursLogged: 0 };
      }

      // Sort points chronologically to ensure timeline calculation safety
      const sortedPoints = [...session.points].sort((a, b) => a.timestamp - b.timestamp);
      let totalTrackingActiveMs = 0;

      // Loop through coordinates and accumulate time ONLY if updates are consecutive (within 5 minutes)
      for (let i = 1; i < sortedPoints.length; i++) {
        const delta = sortedPoints[i].timestamp - sortedPoints[i - 1].timestamp;
        
        // If the gap is less than 5 minutes, add it to active working time
        if (delta > 0 && delta <= 5 * 60 * 1000) {
          totalTrackingActiveMs += delta;
        }
      }

      const activeHours = (totalTrackingActiveMs / 3600000);

      return {
        date: session.date,
        startedAt: sortedPoints[0].timestamp,
        endedAt: session.lastPing,
        hoursLogged: parseFloat(activeHours.toFixed(2)) // Returns exact time tracked
      };
    });

    res.status(200).json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compile precise metrics" });
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

// 🟢 OFFLINE SYNC ENDPOINT: Saves a bulk array of coordinates collected while offline
app.post('/api/routes/sync-offline', async (req, res) => {
  const { userId, name, date, points } = req.body;

  if (!userId || !date || !Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: "Invalid sync payload parameters." });
  }

  try {
    // Clean and sort the inbound points chronologically
    const verifiedPoints = points
      .filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && p.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (verifiedPoints.length === 0) {
      return res.status(400).json({ error: "No valid coordinate nodes found." });
    }

    const latestPing = verifiedPoints[verifiedPoints.length - 1].timestamp;

    // Bulk push the points array directly into the database row for that date
    await Route.updateOne(
      { userId, date },
      {
        $set: { name, lastPing: latestPing },
        $push: { points: { $each: verifiedPoints } }
      },
      { upsert: true }
    );

    console.log(`📥 Successfully synced ${verifiedPoints.length} offline tracking points for user: ${userId}`);
    res.status(200).json({ success: true, message: "Offline sync completed successfully." });
  } catch (err) {
    console.error("Offline sync database crash:", err);
    res.status(500).json({ error: "Failed to clear local batch pool to cloud database." });
  }
});

// 🟢 OFFLINE VISITS SYNC ENDPOINT: Processes a bulk batch of CRM reports logged while offline
app.post('/api/visits/sync-offline', async (req, res) => {
  const { visits } = req.body;

  if (!Array.isArray(visits) || visits.length === 0) {
    return res.status(400).json({ error: "Invalid visit sync payload parameters." });
  }

  try {
    // Format the bulk entries for MongoDB insertMany rules
    const formattedVisits = visits.map(v => ({
      userId: v.userId,
      employeeName: v.employeeName,
      date: v.date || new Date().toISOString().split('T')[0],
      clientName: v.clientName,
      summary: v.summary,
      lat: v.lat || 0,
      lng: v.lng || 0,
      timestamp: v.timestamp || Date.now()
    }));

    await Visit.insertMany(formattedVisits);
    console.log(`📥 Successfully flushed ${formattedVisits.length} cached field reports to Atlas CRM matrix.`);
    
    res.status(200).json({ success: true, message: "Bulk visit notes synced successfully." });
  } catch (err) {
    console.error("Bulk visit sync processing crash:", err);
    res.status(500).json({ error: "Database rejected bulk visit cache payload." });
  }
});