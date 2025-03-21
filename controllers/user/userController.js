const User = require('../../Models/userModel');
const Offer = require('../../Models/offerModel');
const bcrypt = require('bcryptjs');
const userAuthenticated = require('../../middleware/authMiddleware');

// -------------User Home Page--------------------
exports.home = (req, res) => {
  res.render('user/home');
};

// -------------User signin Page--------------------
exports.loginGET = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('user/signin');
};

exports.loginPOST = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('user/signin', {
        error: 'User not registered',
        email,
      });
    }

    if (user.status === 'blocked') {
      return res.render('user/signin', {
        error: `${email} is blocked`,
        email,
      });
    }

    if (!user.password) {
      return res.render('user/signin', {
        error: 'Login with Google or use Forgot Password',
        email,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('user/signin', {
        error: 'Wrong Email or Password',
        email,
      });
    }

    req.session.user = user;

    res.redirect('/');
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// -------------User Signup Page--------------------
const { OTP, saveOTP } = require('../../Models/otpModel');
const nodemailer = require('nodemailer');
const { generateOTP, sendOTPEmail } = require('../../utils/sendOTPutil');
const crypto = require('crypto');

exports.signupGET = (req, res) => {
  res.render('user/signup');
};



// Generate and send OTP, save OTP to database
exports.signupPOST = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    const otp = generateOTP();
    console.log('first generated otp is ' + otp);
    await sendOTPEmail(email, otp);
    await saveOTP(email, otp);

    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Verify OTP and save user data to database
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, fullName, password } = req.body;
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const newUser = new User({ fullName, email, password });
    await newUser.save();

    const user = await User.findOne({ email });
    req.session.user = user;
    await OTP.deleteOne({ email, otp });

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord) {
      return res.status(400).json({ message: 'Email is not registered' });
    }

    const newOtp = generateOTP();
    console.log('resend OTP is ' + newOtp);
    otpRecord.otp = newOtp;
    otpRecord.createdAt = Date.now();
    await otpRecord.save();

    await sendOTPEmail(email, newOtp);

    res.status(200).json({ message: 'OTP resent to your email' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// -------------User Logout--------------------
// In your route handler file
exports.logoutPOST = (req, res) => {
  try {
    // Set headers to prevent caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Destroy the session
    req.session.destroy(err => {
      if (err) {
        console.error('Error during logout:', err);
        return res.status(500).send('Failed to log out. Please try again.');
      }

      // Clear all session-related cookies
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });

      // Handle Google logout if it's a Google user
      if (req.isAuthenticated()) {
        req.logout(err => {
          if (err) {
            console.error('Error logging out Google user:', err);
          }
          return res.status(200).json({ redirect: '/signin' });
        });
      } else {
        // Regular logout
        return res.status(200).json({ redirect: '/signin' });
      }
    });
  } catch (error) {
    console.error('Error in logoutPOST:', error);
    res.status(500).send('Server error during logout.');
  }
};

exports.getAboutPage = (req, res) => {
  try {
    res.render('user/about');
  } catch (error) {
    console.error('Error is getAboutPage:', error);
    res.status(500).render('error', { message: 'Internal Server Error' });
  }
};
