const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

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
    });

    const token = signToken(user);

    return res.status(201).json({
      success: true,
      message: 'Account created',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
        },
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
      '+password name email phone role status'
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
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
        },
      },
    });
  } catch (err) {
    console.error('signin error:', err.message);
    return res.status(500).json({ success: false, message: 'Sign in failed' });
  }
};
