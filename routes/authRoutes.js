const express = require('express');
const passport = require('passport');
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);
const User = require('../../Models/userModel');

// POST route to handle Google OAuth login
router.post('/auth/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub, name, email } = payload;

    let user = await User.findOne({ googleId: sub });
    if (!user) {
      user = new User({
        googleId: sub,
        fullName: name,
        email: email,
      });
      await user.save();
    }

    req.login(user, err => {
      if (err) return res.status(500).json({ error: 'Login failed' });

      // Set user session
      req.session.user = user;

      // Redirect to appropriate page
      res.status(200).json({
        success: true,
        redirectUrl: '/user/home', // or wherever you want to redirect
      });
    });
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
});

module.exports = router;
