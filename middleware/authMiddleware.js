const isUserAuthenticated = (req, res, next) => {
  // Set strict cache control headers
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  if (req.session.user) {
    next();
  } else {
    // Clear any existing cookies
    res.clearCookie('connect.sid');
    
    // Send a 401 status for AJAX requests
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(401).json({ redirect: '/signin' });
    }
    
    // For regular requests, redirect to signin
    return res.redirect('/signin');
  }
};

module.exports = isUserAuthenticated;
