const mongoose = require('mongoose');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB is successfully connected');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });
