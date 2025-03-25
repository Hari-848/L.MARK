const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  purpose: {
    type: String,
    enum: ['signup', 'password_reset', 'email_change'],
    default: 'signup'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // OTP expires after 10 minutes (600 seconds)
  },
});

// Remove the explicit index (it's not needed)
const OTP = mongoose.model('OTP', otpSchema);

const saveOTP = async (email, otp, purpose = 'signup', userId = null) => {
  try {
    // Delete any existing OTPs for this email and purpose
    await OTP.deleteMany({ email, purpose });
    
    // Create new OTP record
    const otpRecord = new OTP({
      email,
      otp,
      purpose,
      userId
    });
    
    await otpRecord.save();
    return true;
  } catch (error) {
    console.error('Error saving OTP:', error);
    return false;
  }
};

module.exports = { OTP, saveOTP };
