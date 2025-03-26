const User = require('../../Models/userModel');
const Offer = require('../../Models/offerModel');
const bcrypt = require('bcryptjs');
const userAuthenticated = require('../../middleware/authMiddleware');
const Address = require('../../Models/addressModel');
const Order = require('../../Models/orderModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// -------------User Home Page--------------------
exports.home = (req, res) => {
  const user = req.session.user || req.user;
  if (!user) {
    return res.redirect('/signin');
  }
  res.render('user/home', { user });
};

// -------------User signin Page--------------------
exports.loginGET = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('user/signin');
};

// Update loginPOST function
exports.loginPOST = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);
    
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('User not found:', email);
      return res.render('user/signin', {
        error: 'User not registered',
        email,
      });
    }

    if (user.status === 'blocked') {
      console.log('User is blocked:', email);
      return res.render('user/signin', {
        error: `${email} is blocked`,
        email,
      });
    }

    if (!user.password) {
      console.log('User has no password (social login):', email);
      return res.render('user/signin', {
        error: 'Login with Google or use Forgot Password',
        email,
      });
    }

    // Log password details for debugging (remove in production)
    console.log('Comparing passwords for user:', email);
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password mismatch for user:', email);
      return res.render('user/signin', {
        error: 'Wrong Email or Password',
        email,
      });
    }

    console.log('Login successful for user:', email);
    
    // Simplified session handling without encryption
    const userObject = user.toObject();
    delete userObject.password;
    
    req.session.user = userObject;
    req.session.authenticated = true;
    
    // Use callback to ensure session is saved
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).render('user/signin', {
          error: 'Login failed, please try again',
          email,
        });
      }
      res.redirect('/');
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('user/signin', {
      error: 'Login failed, please try again',
      email: req.body.email,
    });
  }
};

// Update error handling in getAboutPage
exports.getAboutPage = (req, res) => {
  try {
    res.render('user/about');
  } catch (error) {
    console.error('About page error:', error);
    res.redirect('/'); // Redirect to home instead of showing error page
  }
};

// Update logoutPOST function
exports.logoutPOST = async (req, res) => {
  try {
    if (req.isAuthenticated()) {
      await new Promise((resolve) => req.logout(resolve));
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
      });
      res.status(200).json({ redirect: '/signin' });
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
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
    // First handle passport logout if user is authenticated
    if (req.isAuthenticated()) {
      req.logout((err) => {
        if (err) {
          console.error('Passport logout error:', err);
          return res.status(500).json({ error: 'Logout failed' });
        }
        
        // Then destroy the session after passport logout
        req.session.destroy((err) => {
          if (err) {
            console.error('Session destroy error:', err);
            return res.status(500).json({ error: 'Logout failed' });
          }
          
          res.clearCookie('connect.sid');
          return res.status(200).json({ redirect: '/signin' });
        });
      });
    } else {
      // If not authenticated with passport, just destroy the session
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
          return res.status(500).json({ error: 'Logout failed' });
        }
        
        res.clearCookie('connect.sid');
        return res.status(200).json({ redirect: '/signin' });
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error during logout' });
  }
};

// Get User Profile
exports.getProfile = async (req, res) => {
  try {
    const user = req.session.user || req.user;
    if (!user) {
      return res.redirect('/signin');
    }

    const orders = await Order.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(5);
    const addresses = await Address.find({ userId: user._id });

    res.render('user/profile', {
      title: 'My Profile',
      layout: 'layouts/main',
      user,
      orders,
      addresses,
      session: req.session
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.redirect('/');
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    console.log('Update profile request received');
    console.log('Request body:', req.body);
    console.log('Session user:', req.session.user);
    
    const { fullName, email, mobile } = req.body;
    const userId = req.session.user._id;
    const currentEmail = req.session.user.email;
    
    // If email is being changed, handle differently
    if (email !== currentEmail) {
      // Check if email is already in use by another user
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email is already in use by another account' });
      }
      
      // Generate OTP for email verification
      const otp = generateOTP();
      console.log('Email change OTP:', otp);
      
      // Save OTP to database with new email
      await OTP.findOneAndDelete({ userId }); // Delete any existing OTPs
      await OTP.create({
        email,
        otp,
        userId,
        purpose: 'email_change',
        createdAt: Date.now()
      });
      
      // Send OTP to new email
      await sendOTPEmail(email, otp);
      
      // Update only name and mobile for now
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { fullName, mobile },
        { new: true }
      );
      
      req.session.user = updatedUser;
      
      // Return response indicating email verification needed
      return res.json({ 
        success: true, 
        message: 'Profile updated. Please verify your new email address.',
        requireEmailVerification: true,
        newEmail: email
      });
    }
    
    // If email is not changing, update all fields directly
    console.log('Updating user with ID:', userId);
    console.log('New data:', { fullName, email, mobile });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { fullName, email, mobile },
      { new: true }
    );
    
    console.log('Updated user:', updatedUser);

    req.session.user = updatedUser;
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.user._id;
    
    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if current password matches
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Validate new password
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character' 
      });
    }

    // Hash the new password with 10 salt rounds to match the user model
    const salt = await bcrypt.genSalt(10); // Changed back to 10 to match the model
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update the user's password directly
    await User.findByIdAndUpdate(userId, { password: hashedPassword });
    
    console.log('Password updated successfully for user:', userId);
    console.log('New password hash:', hashedPassword);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// Address Management
exports.addAddress = async (req, res) => {
  try {
    const { name, mobile, address, city, state, pincode, isDefault } = req.body;
    const userId = req.session.user._id;
    
    // Validate inputs
    if (!name || !mobile || !address || !city || !state || !pincode) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Validate mobile number
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }
    
    // Validate pincode
    const pincodeRegex = /^[0-9]{6}$/;
    if (!pincodeRegex.test(pincode)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit pincode' });
    }
    
    // If this is the default address, unset any existing default
    if (isDefault) {
      await Address.updateMany(
        { userId: userId, isDefault: true },
        { $set: { isDefault: false } }
      );
    }
    
    // Create new address with correct field names matching the schema
    const newAddress = new Address({
      userId: userId,     // Changed from user to userId
      fullName: name,     // Changed from name to fullName
      mobile,
      address,
      city,
      state,
      pincode,
      isDefault: isDefault || false
    });
    
    await newAddress.save();
    console.log('New address saved:', newAddress);
    
    res.status(201).json({ success: true, message: 'Address added successfully' });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ error: 'Failed to add address' });
  }
};

// Update Address
exports.updateAddress = async (req, res) => {
  try {
    const addressId = req.params.addressId;
    console.log('Update address request received for ID:', addressId);
    console.log('Request body:', req.body);
    
    // If the addressId is not in the URL params, try to get it from the request body
    const actualAddressId = addressId || req.body._id;
    console.log('Using address ID:', actualAddressId);
    
    const { name, mobile, address, city, state, pincode, isDefault } = req.body;
    const userId = req.session.user._id;
    
    // Validate inputs
    if (!name || !mobile || !address || !city || !state || !pincode) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Find the address to make sure it belongs to the user
    const existingAddress = await Address.findOne({ _id: actualAddressId, userId });
    console.log('Existing address found:', existingAddress);
    
    if (!existingAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    // If this is being set as default, unset any existing default
    if (isDefault && !existingAddress.isDefault) {
      await Address.updateMany(
        { userId, isDefault: true },
        { $set: { isDefault: false } }
      );
    }
    
    // Update the address
    const updatedAddress = await Address.findByIdAndUpdate(
      actualAddressId,
      {
        fullName: name,
        mobile,
        address,
        city,
        state,
        pincode,
        isDefault: isDefault || false
      },
      { new: true }
    );
    
    console.log('Address updated:', updatedAddress);
    
    res.json({ success: true, message: 'Address updated successfully' });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const userId = req.session.user._id;
    await Address.findOneAndDelete({ _id: addressId, userId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete address' });
  }
};

// Configure multer for profile photo uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = 'public/uploads/profiles';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function(req, file, cb) {
    // Accept only image files
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Upload profile photo
exports.uploadProfilePhoto = [
  (req, res, next) => {
    upload.single('profilePhoto')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: err.message || 'File upload error' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const userId = req.session.user._id;
      const photoUrl = `/uploads/profiles/${req.file.filename}`;

      // Update user in database
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { profilePhoto: photoUrl },
        { new: true }
      );

      // Update session
      req.session.user = updatedUser;

      res.json({ 
        success: true, 
        message: 'Profile photo updated successfully',
        photoUrl: photoUrl
      });
    } catch (error) {
      console.error('Profile photo upload error:', error);
      res.status(500).json({ error: 'Failed to upload profile photo' });
    }
  }
];


// Verify Email Change OTP
exports.verifyEmailChange = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const userId = req.session.user._id;
    
    // Find the OTP record
    const otpRecord = await OTP.findOne({ 
      userId, 
      email, 
      otp,
      purpose: 'email_change'
    });
    
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    // Check if OTP is expired (10 minutes)
    const otpCreatedAt = new Date(otpRecord.createdAt);
    const now = new Date();
    const diffInMinutes = (now - otpCreatedAt) / (1000 * 60);
    
    if (diffInMinutes > 10) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }
    
    // Update the user's email
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { email },
      { new: true }
    );
    
    // Update session
    req.session.user = updatedUser;
    
    // Delete the OTP record
    await OTP.deleteOne({ _id: otpRecord._id });
    
    res.json({ success: true, message: 'Email updated successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
};

// Resend Email Change OTP
exports.resendEmailChangeOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.session.user._id;
    
    // Check if email is already in use by another user
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use by another account' });
    }
    
    // Generate new OTP
    const otp = generateOTP();
    console.log('Resend email change OTP:', otp);
    
    // Update or create OTP record
    await OTP.findOneAndUpdate(
      { userId, email, purpose: 'email_change' },
      { otp, createdAt: Date.now() },
      { upsert: true, new: true }
    );
    
    // Send OTP to new email
    await sendOTPEmail(email, otp);
    
    res.json({ success: true, message: 'OTP sent to your new email address' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// Set Default Address
exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;
    
    console.log('Setting default address for ID:', addressId);
    
    // First, find the address to ensure it exists and belongs to the user
    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    // Update all addresses to set isDefault to false
    await Address.updateMany(
      { userId },
      { $set: { isDefault: false } }
    );
    
    // Then update just this address to set isDefault to true
    // Use findByIdAndUpdate to avoid validation issues
    await Address.findByIdAndUpdate(
      addressId,
      { $set: { isDefault: true } },
      { runValidators: false }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ error: 'Failed to set default address' });
  }
};