const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  joinedAt: { type: Date, default: Date.now }
});

// Text index allows HR to do fuzzy matching search (e.g. searching "Ary" finds "Aryan")
EmployeeSchema.index({ name: 'text', email: 'text' });

module.exports = mongoose.model('Employee', EmployeeSchema);