const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { fullScreenAccess, isSuperAdminRole, normalizeRoleForStorage } = require('../constants/screens');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, default: 'user' },
    status: { type: String, default: 'active' },
    screenAccess: {
      type: [String],
      default: [],
    },
  },
  {
    collection: 'user_details',
    timestamps: true,
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.pre('save', function applySuperAdminDefaults(next) {
  if (isSuperAdminRole(this.role)) {
    this.role = normalizeRoleForStorage(this.role);
    this.screenAccess = fullScreenAccess();
  }
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
