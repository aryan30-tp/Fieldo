const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// --- DATABASE SCHEMAS & MODELS ---
const RouteSchema = new mongoose.Schema({
  userId: String,
  name: String,
  date: String,
  points: [{ lat: Number, lng: Number, timestamp: Number }],
  lastPing: Number,
  isActive: Boolean
});
const Route = mongoose.model('Route', RouteSchema);

const VisitSchema = new mongoose.Schema({
  userId: String,
  employeeName: String,
  date: String,
  clientName: String,
  contactPerson: String,
  personPosition: String,
  personMobile: String,
  summary: String,
  lat: Number,
  lng: Number,
  timestamp: Number
});
const Visit = mongoose.model('Visit', VisitSchema);

const EmployeeSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  empId: String,
  firstName: String,
  lastName: String,
  name: String,
  area: String,
  email: { type: String, unique: true },
  mobile: String,
  currentDeviceId: String
});
const Employee = mongoose.model('Employee', EmployeeSchema);

// 🟢 NEW: Notification Schema for Issue Reporting
const NotificationSchema = new mongoose.Schema({
  userId: String,
  employeeName: String,
  subject: String,
  description: String,
  timestamp: { type: Number, default: Date.now }
});
const Notification = mongoose.model('Notification', NotificationSchema);

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

// --- GEOSPATIAL HAVERSINE CALCULATOR ENGINE ---
function calculateDistanceKM(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- 1. EMPLOYEE PROFILE & AUTH PRIVILEGES ---

app.post('/api/employees/sync', async (req, res) => {
  const { userId, name, email, deviceId } = req.body;
  try {
    const updatePayload = { email };
    if (deviceId) updatePayload.currentDeviceId = deviceId;

    const employee = await Employee.findOneAndUpdate(
      { userId },
      { 
        $set: updatePayload,
        $setOnInsert: { firstName: name, empId: String(Date.now()).slice(-4) } 
      },
      { upsert: true, new: true }
    );
    res.status(200).json(employee);
  } catch (err) {
    res.status(500).json({ error: "Failed to sync profile" });
  }
});

app.post('/api/employees/verify-session', async (req, res) => {
  const { userId, currentDeviceId } = req.body;
  if (!userId || !currentDeviceId) return res.status(400).json({ error: "Parameters missing" });
  try {
    const employee = await Employee.findOne({ userId }).lean();
    if (!employee) return res.status(404).json({ error: "Profile not found" });
    res.status(200).json({ valid: employee.currentDeviceId === currentDeviceId });
  } catch (err) {
    res.status(500).json({ error: "Verification server loop error" });
  }
});

// --- 2. ADVANCED MANAGEMENT & METRICS HARVESTER ---

app.get('/api/hr/employees', async (req, res) => {
  try {
    const employees = await Employee.find({}).lean();
    const now = new Date();
    const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

    const enrichedRoster = await Promise.all(employees.map(async (emp) => {
      const monthlyShifts = await Route.find({
        userId: emp.userId,
        date: { $gte: startOfMonthStr, $lte: endOfMonthStr }
      }).lean();

      let daysPresentCount = 0;
      let totalDistanceThisMonth = 0;

      monthlyShifts.forEach(session => {
        if (session.points && session.points.length >= 2) {
          const sortedPoints = [...session.points].sort((a, b) => a.timestamp - b.timestamp);
          let activeTrackingMs = 0;

          for (let i = 1; i < sortedPoints.length; i++) {
            const delta = sortedPoints[i].timestamp - sortedPoints[i - 1].timestamp;
            
            // 🗺️ Mileage accumulation logic
            const kmGained = calculateDistanceKM(
              sortedPoints[i - 1].lat, sortedPoints[i - 1].lng,
              sortedPoints[i].lat, sortedPoints[i].lng
            );
            // Ignore suspicious telemetry spikes above 120km/h
            if (kmGained > 0 && kmGained < 10) {
              totalDistanceThisMonth += kmGained;
            }

            if (delta > 0 && delta <= 5 * 60 * 1000) activeTrackingMs += delta;
          }

          if ((activeTrackingMs / 3600000) >= 4.0) daysPresentCount++;
        }
      });

      const topClients = await Visit.aggregate([
        { $match: { userId: emp.userId } },
        { $group: { _id: "$clientName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]);

      let autoCalculatedCity = emp.area || "Not Tracking";
      if (monthlyShifts.length > 0 && monthlyShifts[0].points?.length > 0) {
        const startPt = monthlyShifts[0].points[0];
        if (startPt.lat >= 28.30 && startPt.lat <= 28.55 && startPt.lng >= 76.80 && startPt.lng <= 77.15) {
          autoCalculatedCity = "Gurugram";
        } else if (startPt.lat >= 28.50 && startPt.lat <= 28.75 && startPt.lng >= 77.05 && startPt.lng <= 77.35) {
          autoCalculatedCity = "Delhi";
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
        totalDistance: parseFloat(totalDistanceThisMonth.toFixed(2)), // 🟢 Live Distance Metric Added
        freqClient1: topClients[0]?._id || '-',
        freqClient2: topClients[1]?._id || '-',
        freqClient3: topClients[2]?._id || '-'
      };
    }));

    res.status(200).json(enrichedRoster);
  } catch (err) {
    res.status(500).json({ error: "Harvester compilation failure" });
  }
});

app.post('/api/hr/employees/add', async (req, res) => {
  const { empId, firstName, lastName, area, email, mobile } = req.body;
  try {
    const existing = await Employee.findOne({ $or: [{ email }, { empId }] });
    if (existing) return res.status(400).json({ error: "Parameter collision." });

    const newEmp = new Employee({
      userId: "PROVISIONED_" + Math.random().toString(36).substring(2, 11),
      empId, firstName, lastName, area: area || '-', email, mobile, name: firstName
    });
    await newEmp.save();
    res.status(201).json({ success: true, employee: newEmp });
  } catch (err) {
    res.status(500).json({ error: "Provisioning failure" });
  }
});

app.put('/api/hr/employees/:id', async (req, res) => {
  try {
    const updatedEmployee = await Employee.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    res.status(200).json({ success: true, employee: updatedEmployee });
  } catch (err) {
    res.status(500).json({ error: "Profile modification save error." });
  }
});

app.delete('/api/hr/employees/:id', async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Data wipe action error" });
  }
});

// --- 3. ATTENDANCE & ANALYTICS PIPELINES ---

app.get('/api/attendance/:userId', async (req, res) => {
  try {
    const sessions = await Route.find({ userId: req.params.userId }).sort({ date: -1 }).lean();
    const logs = sessions.map(session => {
      if (!session.points || session.points.length < 2) {
        return { date: session.date, startedAt: null, endedAt: session.lastPing, hoursLogged: 0 };
      }
      const sortedPoints = [...session.points].sort((a, b) => a.timestamp - b.timestamp);
      let totalTrackingActiveMs = 0;
      for (let i = 1; i < sortedPoints.length; i++) {
        const delta = sortedPoints[i].timestamp - sortedPoints[i - 1].timestamp;
        if (delta > 0 && delta <= 5 * 60 * 1000) totalTrackingActiveMs += delta;
      }
      return {
        date: session.date,
        startedAt: sortedPoints[0].timestamp,
        endedAt: session.lastPing,
        hoursLogged: parseFloat((totalTrackingActiveMs / 3600000).toFixed(2))
      };
    });
    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: "Metrics error" });
  }
});

// --- 4. VISIT TRACKER & BATCH CACHING REGISTRIES ---

app.post('/api/visits', async (req, res) => {
  try {
    const newVisit = new Visit({ ...req.body, timestamp: Date.now() });
    await newVisit.save();
    res.status(201).json(newVisit);
  } catch (err) {
    res.status(500).json({ error: "Failed to post note summary" });
  }
});

app.get('/api/visits', async (req, res) => {
  try {
    const notes = await Visit.find(req.query).sort({ timestamp: -1 });
    res.status(200).json(notes);
  } catch (err) {
    res.status(500).json({ error: "Pull error" });
  }
});

app.get('/api/routes/:userId/:date', async (req, res) => {
  try {
    const route = await Route.findOne(req.params);
    res.status(200).json(route || { userId: req.params.userId, date: req.params.date, points: [] });
  } catch (err) {
    res.status(500).json({ error: "Historic loop drop" });
  }
});

app.post('/api/routes/sync-offline', async (req, res) => {
  const { userId, name, date, points } = req.body;
  try {
    const verifiedPoints = points.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && p.timestamp);
    if (verifiedPoints.length === 0) return res.status(400).json({ error: "Empty nodes" });
    await Route.updateOne({ userId, date }, { $set: { name, lastPing: verifiedPoints[verifiedPoints.length - 1].timestamp }, $push: { points: { $each: verifiedPoints } } }, { upsert: true });
    res.status(200).json({ success: true });
  } catch (err) { res.status(500).json({ error: "Crash" }); }
});

app.post('/api/visits/sync-offline', async (req, res) => {
  try {
    await Visit.insertMany(req.body.visits);
    res.status(200).json({ success: true });
  } catch (err) { res.status(500).json({ error: "Cache rejected" }); }
});

// --- 5. 🟢 NEW: NOTIFICATION ISSUE ENGINE ENDPOINTS ---

app.post('/api/notifications/report', async (req, res) => {
  const { userId, employeeName, subject, description } = req.body;
  try {
    const problemRecord = new Notification({ userId, employeeName, subject, description });
    await problemRecord.save();
    
    // Broadcast live over websockets layout instantly to all connected monitors
    io.emit('ui-sync-notification-received', problemRecord);
    res.status(201).json({ success: true, notification: problemRecord });
  } catch (err) {
    res.status(500).json({ error: "Failed to stream notification logs." });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const alerts = await Notification.find({}).sort({ timestamp: -1 });
    res.status(200).json(alerts);
  } catch (err) {
    res.status(500).json({ error: "Failed to gather notifications queue." });
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    io.emit('ui-sync-notification-wiped', req.params.id);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Wipe target failed." });
  }
});

// --- 6. 🟢 NEW: ENTERPRISE NUKE RESET ACTION ---
app.post('/api/system/nuke-reset', async (req, res) => {
  const { confirmToken } = req.body;
  if (confirmToken !== "MASTER_DELETE_CONFIRMED") {
    return res.status(403).json({ error: "Unauthorized structural wipe instruction attempt." });
  }
  try {
    await Promise.all([
      Route.deleteMany({}),
      Visit.deleteMany({}),
      Employee.deleteMany({}),
      Notification.deleteMany({})
    ]);
    io.emit('ui-sync-system-nuked');
    res.status(200).json({ success: true, message: "System architecture successfully reset to absolute baseline zero." });
  } catch (err) {
    res.status(500).json({ error: "Failed to complete hard reset execution query loop." });
  }
});

// --- 7. WEBSOCKET PIPELINE SYNC MATRIX ---
io.on('connection', (socket) => {
  socket.on('register', (data) => { socket.userId = data.userId; });
  socket.on('hr-employee-updated', (emp) => { socket.broadcast.emit('ui-sync-employee-updated', emp); });
  socket.on('hr-employee-deleted', (id) => { socket.broadcast.emit('ui-sync-employee-deleted', id); });

  socket.on('location-update', async (data) => {
    const { userId, name, lat, lng, timestamp } = data;
    socket.broadcast.emit('hr-location-stream', { userId, name, lat, lng, timestamp });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Complete Enterprise API running on port ${PORT}`));