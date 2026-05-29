const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { SCREEN_GROUPS } = require('../constants/screens');
const serializeUser = require('../utils/serializeUser');

const signToken = (user) => {
  const serialized = serializeUser(user);
  return jwt.sign(
    {
      id: serialized.id,
      email: serialized.email,
      role: serialized.role,
      name: serialized.name,
      screenAccess: serialized.screenAccess,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

exports.signup = async (req, res) => {
  try {
    const { fullname, email, mobile, password } = req.body;

    if (!fullname || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'fullname, email, and password are required',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name: fullname,
      email: email.toLowerCase(),
      phone: mobile || '',
      password,
      role: 'user',
      screenAccess: [],
    });

    const token = signToken(user);

    return res.status(201).json({
      success: true,
      message: 'Account created',
      data: {
        token,
        user: serializeUser(user),
      },
    });
  } catch (err) {
    console.error('signup error:', err.message);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
};

exports.signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password name email phone role status screenAccess'
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is not active' });
    }

    const token = signToken(user);

    return res.json({
      success: true,
      message: 'Signed in',
      data: {
        token,
        user: serializeUser(user),
      },
    });
  } catch (err) {
    console.error('signin error:', err.message);
    return res.status(500).json({ success: false, message: 'Sign in failed' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('name email phone role status screenAccess createdAt updatedAt')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is not active' });
    }

    const serialized = serializeUser(user);
    const jwtRole = req.user.role;
    const jwtAccess = JSON.stringify(req.user.screenAccess || []);
    const dbAccess = JSON.stringify(serialized.screenAccess || []);
    const tokenOutdated = jwtRole !== serialized.role || jwtAccess !== dbAccess;

    const data = {
      user: serialized,
      screenGroups: SCREEN_GROUPS,
    };

    if (tokenOutdated) {
      const freshUser = await User.findById(req.user.id);
      data.token = signToken(freshUser);
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('getMe error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
};
