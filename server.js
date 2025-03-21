require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const fs = require('fs');

const app = express();
const passport = require('passport');
const session = require('express-session');
const mongoose = require('mongoose');
const User = require('./Models/userModel');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const nocache = require('nocache');
const userRoutes = require('./routes/userRoutes'); // Include your user routes
const adminRoutes = require('./routes/adminRoutes');
const Product = require('./Models/productSchema');
const MongoStore = require('connect-mongo');

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));
require('./config/db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(nocache());

app.use(
  session({
    secret: process.env.SESSION_SECRET || '123456755',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60,
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true, // Protect against XSS
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      sameSite: 'strict' // Protect against CSRF
    },
  })
);

// Make session accessible in all views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// Google Authentication
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.callbackURI,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google Profile:', profile); // Debug log

        let user = await User.findOne({ email: profile.emails[0].value });
        console.log('Found user:', user); // Debug log

        if (user) {
          if (user.status === 'blocked') {
            return done(null, false, {
              message: `${profile.emails[0].value} is blocked`,
            });
          }
          user.googleId = profile.id;
        } else {
          user = new User({
            googleId: profile.id,
            fullName: profile.displayName,
            email: profile.emails[0].value,
            isGoogleUser: true, // Add this flag
          });
        }

        await user.save();
        console.log('Saved user:', user); // Debug log
        return done(null, user);
      } catch (err) {
        console.error('Google Strategy Error:', err); // Debug log
        return done(err, null);
      }
    }
  )
);

// Update serialization to include more data
passport.serializeUser((user, done) => {
  console.log('Serializing user:', user); // Debug log
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    console.log('Deserialized user:', user); // Debug log
    done(null, user);
  } catch (err) {
    console.error('Deserialize Error:', err); // Debug log
    done(err, null);
  }
});

// Routes for Google Login
app.use(passport.initialize());
app.use(passport.session());

// Homepage route with session check
const isAuthenticated = (req, res, next) => {
  console.log('Session check:', req.session); // Debug log
  console.log('Is authenticated:', req.isAuthenticated()); // Debug log

  if (req.session.user || req.isAuthenticated()) {
    return next();
  }
  res.redirect('/signin');
};

// Protected routes
app.get('/', isAuthenticated, (req, res) => {
  res.render('user/home', { user: req.session.user });
});

// Google OAuth route
app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })
);

// Signin page route
app.get('/signin', (req, res) => {
  if (req.session.user) {
    return res.redirect('/'); // Redirect to home if the user is already logged in
  }
  res.render('user/signin'); // Render signin page if the user is not logged in
});

app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    console.log('Callback received:', { err, user, info }); // Debug log

    if (err) {
      console.error('Authentication error:', err);
      return res.redirect('/signin?error=auth_error');
    }

    if (!user) {
      console.log('No user found:', info);
      return res.redirect('/signin?error=no_user');
    }

    req.logIn(user, err => {
      if (err) {
        console.error('Login error:', err);
        return res.redirect('/signin?error=login_failed');
      }

      // Set session data
      req.session.user = {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        isGoogleUser: true,
      };

      // Save session explicitly
      req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('/signin?error=session_error');
        }
        console.log('Session saved successfully:', req.session);
        res.redirect('/');
      });
    });
  })(req, res, next);
});

// Use the user routes
app.use('/', userRoutes);

app.use('/admin', adminRoutes);

// 404 handler should be at the end
app.use((req, res, next) => {
  const isAdmin = req.originalUrl.startsWith('/admin');
  res.status(404).render('partials/user/404', { isAdmin });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    error:
      process.env.NODE_ENV === 'development' ? err : 'Something went wrong!',
  });
});

// Authentication check middleware
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() || req.session.user) {
    return next();
  }
  res.redirect('/signin');
};

// Add protected route example
app.get('/user/profile', ensureAuthenticated, (req, res) => {
  res.render('user/profile', { user: req.session.user });
});

app.get('/session-test', (req, res) => {
  res.json({
    session: req.session,
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
  });
});

// Create logs directory
const logsDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory);
}

// Setup Morgan logging
// Development logging for console
app.use(morgan('dev'));

// Production logging to file
const accessLogStream = fs.createWriteStream(
  path.join(logsDirectory, 'access.log'),
  { flags: 'a' }
);
app.use(morgan('combined', { stream: accessLogStream }));

let PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at port ${PORT}`);
});
