const User = require('../models/User');
const Notification = require('../models/Notification');
const {
  ROLES,
  SCREEN_IDS,
  SCREEN_GROUPS,
  SUPER_ADMIN_ROLES,
  isSuperAdmin,
  isSuperAdminRole,
  normalizeRoleForStorage,
} = require('../constants/screens');
const serializeUser = require('../utils/serializeUser');

const validateScreenAccess = (screenAccess) => {
  if (!Array.isArray(screenAccess)) {
    return { ok: false, message: 'screenAccess must be an array' };
  }
  const invalid = screenAccess.filter((id) => !SCREEN_IDS.includes(id));
  if (invalid.length) {
    return { ok: false, message: `Invalid screen access: ${invalid.join(', ')}` };
  }
  return { ok: true, value: screenAccess };
};

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('name email phone role status screenAccess createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        users: users.map((u) => serializeUser(u)),
        screenOptions: SCREEN_IDS,
        screenGroups: SCREEN_GROUPS,
      },
    });
  } catch (err) {
    console.error('listUsers error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, password, role = 'user', status = 'active', screenAccess = [] } =
      req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
      });
    }

    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const screenCheck = validateScreenAccess(screenAccess);
    if (!screenCheck.ok) {
      return res.status(400).json({ success: false, message: screenCheck.message });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || '',
      password,
      role: normalizeRoleForStorage(role),
      status: status === 'inactive' ? 'inactive' : 'active',
      screenAccess: isSuperAdminRole(role) ? SCREEN_IDS : screenCheck.value,
    });

    return res.status(201).json({
      success: true,
      message: 'User created',
      data: { user: serializeUser(user) },
    });
  } catch (err) {
    console.error('createUser error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create user' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, password, role, status, screenAccess } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name !== undefined) user.name = String(name).trim();
    if (phone !== undefined) user.phone = String(phone).trim();
    if (password) user.password = password;

    if (role !== undefined) {
      if (!ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      if (isSuperAdmin(user) && !isSuperAdminRole(role)) {
        const superAdminCount = await User.countDocuments({
          role: { $in: SUPER_ADMIN_ROLES },
        });
        if (superAdminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot demote the only super admin',
          });
        }
      }
      user.role = normalizeRoleForStorage(role);
    }

    if (status !== undefined) {
      user.status = status === 'inactive' ? 'inactive' : 'active';
    }

    const finalRole = user.role;

    if (isSuperAdminRole(finalRole)) {
      user.screenAccess = [...SCREEN_IDS];
    } else if (screenAccess !== undefined) {
      const screenCheck = validateScreenAccess(screenAccess);
      if (!screenCheck.ok) {
        return res.status(400).json({ success: false, message: screenCheck.message });
      }
      user.screenAccess = screenCheck.value;
    }

    user.markModified('screenAccess');
    await user.save();

    const fresh = await User.findById(id)
      .select('name email phone role status screenAccess createdAt updatedAt')
      .lean();

    return res.json({
      success: true,
      message: 'User updated',
      data: { user: serializeUser(fresh) },
    });
  } catch (err) {
    console.error('updateUser error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (isSuperAdmin(user)) {
      const superAdminCount = await User.countDocuments({
        role: { $in: SUPER_ADMIN_ROLES },
      });
      if (superAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the only super admin',
        });
      }
    }

    await Notification.deleteMany({ recipientId: id });
    await User.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'User deleted',
    });
  } catch (err) {
    console.error('deleteUser error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};
