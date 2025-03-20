const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: String,
    otp: String,
    createdAt: { type: Date, default: Date.now, expires: 60 }, // TTL index is already set here
  },
  { timestamps: true }
);

// Remove the explicit index (it’s not needed)
const OTP = mongoose.model('OTP', otpSchema);

const saveOTP = async (email, otp) => {
  const newOTP = new OTP({ email, otp });
  await newOTP.save();
};

module.exports = { OTP, saveOTP };
