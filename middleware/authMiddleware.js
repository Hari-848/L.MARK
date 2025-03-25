const Cart = require('../Models/cartModel');

const isUserAuthenticated = async (req, res, next) => {
  console.log('Session:', req.session);
  console.log('User:', req.user);
  console.log('Is Authenticated:', req.isAuthenticated());

  if (req.session && req.session.user && req.session.authenticated) {
    // Add cart count to locals for use in templates
    try {
      const cart = await Cart.findOne({ userId: req.session.user._id });
      res.locals.cartCount = cart ? cart.items.length : 0;
      console.log('Cart count for user:', res.locals.cartCount);
    } catch (error) {
      console.error('Error fetching cart count:', error);
      res.locals.cartCount = 0;
    }
    
    next();
  } else {
    res.redirect('/user/signin');
  }
};

module.exports = isUserAuthenticated;
