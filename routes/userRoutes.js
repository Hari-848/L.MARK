const express = require('express');
const router = express.Router();
const isUserAuthenticated = require('../middleware/authMiddleware');

const User = require('../controllers/user/userController');
const productsController = require('../controllers/user/productsController');
const wishlistController = require('../controllers/user/wishlistController');
//const userProfileController = require("../controllers/user/userProfileAddressController");

const addressController = require('../controllers/user/addressController');

//--------------------User Signup --------------------
router.get('/user/signup', User.signupGET); // This route will show the signup page
router.post('/user/signup', User.signupPOST);
router.post('/user/verify-otp', User.verifyOTP);
router.post('/user/resend-otp', User.resendOTP);

//--------------------User Login --------------------
router.get('/user/signin', User.loginGET);
router.post('/user/signin', User.loginPOST);

// //-------------------- Personal info Dashboard --------------------
// router.get("/user/profile", userAuthenticated, userProfileController.getPersonalInformation);
// router.post("/user/profile", userProfileController.updatePersonalInformation);

//--------------------Forgot Password --------------------
const forgotPassword = require('../controllers/user/forgotPasswordController');

router.get('/user/forgotPassword', forgotPassword.getForgotPassword);
router.post(
  '/user/forgotPassword/send-otp',
  forgotPassword.sendForgotPasswordOTP
);
router.post(
  '/user/forgotPassword/verify-otp',
  forgotPassword.verifyForgotPasswordOTP
);
router.post(
  '/user/forgotPassword/reset-password',
  forgotPassword.resetPassword
);
router.post(
  '/user/forgotPassword/resend-otp',
  forgotPassword.resendForgotPasswordOTP
);

//--------------------User Logout --------------------
router.post('/user/logout', User.logoutPOST);

// Home page
router.get('/', isUserAuthenticated, User.home);
router.get('/home', isUserAuthenticated, User.home);

//--------------------Products Page --------------------
router.get('/products', isUserAuthenticated, productsController.products);
router.get('/products/filter-options', productsController.getFilterOptions);
router.get(
  '/products/searchFilter',
  productsController.searchAndFilterProducts
);

//--------------------View Product Page --------------------
router.get('/product/:id', productsController.viewProduct);
router.get('/product/getcolor/variant', productsController.getVariantDetails);

//--------------------About Page --------------------
router.get('/about', isUserAuthenticated, User.getAboutPage);

// Add the middleware to any other routes that need protection
// router.get('/cart', isUserAuthenticated, (req, res) => {
//     res.render('user/cart');
// });

// router.get('/wishlist', isUserAuthenticated, (req, res) => {
//     res.render('user/wishlist');
// });

// Logout route
router.get('/logout', User.logoutPOST);

router.get('/profile', isUserAuthenticated, User.getProfile);
router.post('/profile', isUserAuthenticated, User.updateProfile);
router.post('/change-password', isUserAuthenticated, User.changePassword);
router.post('/address', isUserAuthenticated, User.addAddress);
router.put('/address/:addressId', isUserAuthenticated, User.updateAddress);
router.delete('/address/:addressId', isUserAuthenticated, User.deleteAddress);

// Add this to your userRoutes.js
router.post('/user/profile/photo', isUserAuthenticated, User.uploadProfilePhoto);


// Verify Email Change OTP
router.post('/verify-email-change', isUserAuthenticated, User.verifyEmailChange);

// Resend Email Change OTP
router.post('/resend-email-change-otp', isUserAuthenticated, User.resendEmailChangeOTP);

// Set default address
router.put('/address/:id/default', isUserAuthenticated, User.setDefaultAddress);



// Wishlist routes
router.get('/wishlist', isUserAuthenticated, wishlistController.getWishlist);
router.post('/wishlist/add', isUserAuthenticated, wishlistController.addToWishlist);
router.delete('/wishlist/item/:itemId', isUserAuthenticated, wishlistController.removeFromWishlist);
router.delete('/wishlist/clear', isUserAuthenticated, wishlistController.clearWishlist);
router.get('/wishlist/check', isUserAuthenticated, wishlistController.checkWishlist);
router.delete('/wishlist/remove/:productId', isUserAuthenticated, wishlistController.removeProduct);
router.get('/wishlist/all', isUserAuthenticated, wishlistController.getAllWishlistItems);

const checkoutController = require('../controllers/user/checkoutController');

// Checkout routes
router.get('/checkout', isUserAuthenticated, checkoutController.getCheckout);
router.post('/order/place', isUserAuthenticated, checkoutController.placeOrder);
router.get('/order/success/:orderId', isUserAuthenticated, checkoutController.getOrderSuccess);

// Address routes
router.get('/address', isUserAuthenticated, addressController.getAddresses);
router.get('/address/:id', isUserAuthenticated, addressController.getAddress);
router.post('/address', isUserAuthenticated, addressController.createAddress);
router.put('/address/:id', isUserAuthenticated, addressController.updateAddress);
router.delete('/address/:id', isUserAuthenticated, addressController.deleteAddress);
router.put('/address/:id/default', isUserAuthenticated, addressController.setDefaultAddress);

module.exports = router;
