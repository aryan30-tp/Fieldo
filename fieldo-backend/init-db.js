const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// 🚨 Replace this with your actual Atlas string or let it read from your environment
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://aryan30n_db_user:Aryan30@cluster0.l0hzirv.mongodb.net/?appName=Cluster0";

async function initializeIndexes() {
  try {
    console.log("⏳ Connecting to MongoDB Atlas to configure enterprise search vectors...");
    await mongoose.connect(MONGO_URI);
    console.log("📦 Connected!");

    console.log("🧹 Clearing any conflicting stale indexes...");
    await Employee.collection.dropIndexes().catch(() => console.log("No existing indexes to drop. Proceeding..."));

    console.log("⚡ Building compound text search index for Employee master roster...");
    await Employee.collection.createIndex({ name: "text", email: "text" });
    
    console.log("✅ Success! Text search indexes are compiled and active in the cloud.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

initializeIndexes();