const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/user/cartController');

// Cart routes
router.post('/add', cartController.addToCart);
router.post('/check-item', cartController.checkItemInCart);
router.get('/', cartController.getCart);
router.post('/update', cartController.updateCartItem);
router.post('/clear', cartController.clearCart);

module.exports = router; 