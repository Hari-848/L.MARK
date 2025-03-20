const express = require('express');
const router = express.Router();
const isUserAuthenticated = require('../middleware/authMiddleware');

const User = require('../controllers/user/userController');
const productsController = require('../controllers/user/productsController');
//const userProfileController = require("../controllers/user/userProfileAddressController");

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

module.exports = router;
