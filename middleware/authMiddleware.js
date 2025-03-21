const isUserAuthenticated = (req, res, next) => {
  console.log('Session:', req.session);
  console.log('User:', req.user);
  console.log('Is Authenticated:', req.isAuthenticated());

  // Check both session user and passport authentication
  if (req.session.user || req.isAuthenticated()) {
    return next();
  }

  // Clear session and redirect
  req.session.destroy(err => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('connect.sid');
    res.redirect('/signin');
  });
};

module.exports = isUserAuthenticated;
