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
const userRoutes = require('./routes/userRoutes');
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

// Update session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60,
    autoRemove: 'interval',
    autoRemoveInterval: 10,
    touchAfter: 24 * 3600
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}));

// Add this after session middleware and before routes
app.use(async (req, res, next) => {
  try {
    // Skip for admin routes and non-authenticated users
    if (req.path.startsWith('/admin') || !req.session.user) {
      return next();
    }

    // Check if user is blocked
    const user = await User.findById(req.session.user._id);
    if (user && user.status === 'blocked') {
      // Clear user session
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
        // Redirect to signin with blocked message
        res.redirect('/signin?error=account_blocked');
      });
    } else {
      next();
    }
  } catch (err) {
    console.error('Error checking user status:', err);
    next();
  }
});

// Update Google callback route
app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    try {
      if (err || !user) {
        return res.redirect('/signin?error=' + (err ? 'auth_error' : 'no_user'));
      }

      // Clear any existing sessions for this user
      const sessionStore = req.sessionStore;
      await new Promise((resolve, reject) => {
        sessionStore.all((err, sessions) => {
          if (err) reject(err);
          const promises = Object.entries(sessions || {}).map(([sid, session]) => {
            if (session?.user?._id === user._id) {
              return new Promise((r) => sessionStore.destroy(sid, r));
            }
          }).filter(Boolean);
          Promise.all(promises).then(resolve).catch(reject);
        });
      });

      // Create new session
      await new Promise((resolve, reject) => {
        req.logIn(user, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.user = user;
      req.session.authenticated = true;

      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.redirect('/');
    } catch (error) {
      console.error('Callback error:', error);
      return res.redirect('/signin?error=server_error');
    }
  })(req, res, next);
});

// Create error view template
const viewsPath = path.join(__dirname, 'views');
if (!fs.existsSync(path.join(viewsPath, 'error.ejs'))) {
  const errorTemplate = `
<!DOCTYPE html>
<html>
<head>
    <title>Error</title>
</head>
<body>
    <h1>Error</h1>
    <p><%= error %></p>
    <a href="/">Back to Home</a>
</body>
</html>`;
  fs.writeFileSync(path.join(viewsPath, 'error.ejs'), errorTemplate);
}

// Update error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    error: 'An unexpected error occurred'
  });
});

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Make session accessible in views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// Google Authentication Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.callbackURI,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        // Check if user is blocked
        if (user.status === 'blocked') {
          return done(null, false, { message: 'Your account has been blocked by the Admin.' });
        }
        user.googleId = profile.id;
      } else {
        user = new User({
          googleId: profile.id,
          fullName: profile.displayName,
          email: profile.emails[0].value,
          isGoogleUser: true,
          status: 'active' // Set default status
        });
      }

      await user.save();
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).lean();
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() || req.session.user) {
    return next();
  }
  res.redirect('/signin');
};

// Routes
app.get('/', isAuthenticated, (req, res) => {
  res.render('user/home', { user: req.session.user || req.user });
});

app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

app.get('/signin', (req, res) => {
  if (req.session.user || req.isAuthenticated()) {
    return res.redirect('/');
  }
  
  const error = req.query.error;
  let errorMessage = '';
  
  if (error === 'account_blocked') {
    errorMessage = 'Your account has been blocked by the Admin.';
  }
  
  res.render('user/signin', { error: errorMessage });
});

app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    try {
      if (err) {
        console.error('Authentication error:', err);
        return res.redirect('/signin?error=auth_error');
      }

      if (!user) {
        return res.redirect('/signin?error=no_user');
      }

      await new Promise((resolve, reject) => {
        req.logIn(user, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.user = user;
      req.session.authenticated = true;

      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.redirect('/');
    } catch (error) {
      console.error('Callback error:', error);
      return res.redirect('/signin?error=server_error');
    }
  })(req, res, next);
});

app.use('/', userRoutes);
app.use('/admin', adminRoutes);

// Error handlers
app.use((req, res, next) => {
  const isAdmin = req.originalUrl.startsWith('/admin');
  res.status(404).render('partials/user/404', { isAdmin });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    error: process.env.NODE_ENV === 'development' ? err : 'Something went wrong!'
  });
});

// Logging setup
const logsDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory);
}

app.use(morgan('dev'));
const accessLogStream = fs.createWriteStream(path.join(logsDirectory, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at port ${PORT}`);
});
