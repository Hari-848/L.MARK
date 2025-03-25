const express = require('express');
const router = express.Router();
const adminController = require('../controllers/user/adminController.js');
const adminAuthenticated = require('../middleware/adminauthMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');

router.use((req, res, next) => {
    req.session.admin = true;
    next();
});

// Admin login page
router.get('/login', adminController.getLogin);
router.post('/login', adminController.postLogin);
router.post('/logout', adminController.logout);

// Admin dashboard
router.get('/dashboard', adminAuthenticated, adminController.getDashboard);

// product Routes
const adminProduct = require('../controllers/admin/adminProductController');

router.get('/products', adminAuthenticated, adminProduct.getProducts);
router.get('/products/add', adminProduct.getAddProduct);
router.post('/products/add', uploadMiddleware, adminProduct.postAddProduct);

// Comment out unused variant routes
router.get(
  '/products/add/variant',
  adminAuthenticated,
  adminProduct.getAddvariant
);
router.post('/products/add/variant', adminProduct.postAddvariant);

// Admin edit products
router.get(
  '/products/:id/details',
  adminAuthenticated,
  adminProduct.getProductDetails
);
router.post(
  '/products/update/:id',
  adminAuthenticated,
  adminProduct.updateProduct
);

// Admin edit Photo
router.get(
  '/products/:id/image',
  adminAuthenticated,
  adminProduct.getEditProductImage
);
router.post(
  '/products/:id/image',
  uploadMiddleware,
  adminProduct.postEditProductImage
);

// Add these routes if they don't exist
router.get('/products/:id/edit-images', adminProduct.getEditImages);
router.post('/products/:id/add-images', adminProduct.addNewImages);
router.post('/products/:id/update-image', adminProduct.updateProductImage);

router.post('/products/delete/:id', adminProduct.deleteProduct);

// Add this new route
router.post('/products/:id/delete-image', adminProduct.deleteProductImage);

// Admin  Customers
router.get('/customers', adminAuthenticated, adminController.getCustomers);
router.post('/customers/unblock/:id', adminController.unblockCustomer);
router.post('/customers/block/:id', adminController.blockCustomer);
router.post('/customers/updateStatus/:id', adminController.updateStatus);

// Admin  Category
router.get('/category', adminAuthenticated, adminController.getCategories);
router.post('/category/add', adminController.addCategory);
router.post('/category/update/:id', adminController.updateCategory);
router.post('/category/delete/:id', adminController.deleteCategory);

module.exports = router;
