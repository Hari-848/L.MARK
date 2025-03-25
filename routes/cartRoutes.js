const express = require('express');
const router = express.Router();
const cartController = require('../controllers/user/cartController');
const isUserAuthenticated = require('../middleware/authMiddleware');

// Debug middleware
router.use((req, res, next) => {
  console.log('Cart route accessed:', req.method, req.path);
  next();
});

// Cart routes
router.get('/', isUserAuthenticated, cartController.getCart);
router.post('/add', isUserAuthenticated, cartController.addToCart);
router.post('/update', isUserAuthenticated, cartController.updateCartItem);
router.post('/clear', isUserAuthenticated, cartController.clearCart);

module.exports = router; 