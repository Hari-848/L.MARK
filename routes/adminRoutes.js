const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController.js');
const adminAuthenticated = require('../middleware/adminauthMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');
const adminOrderController = require('../controllers/admin/adminOrderController');
const adminCouponController = require('../controllers/admin/adminCouponController');
const adminOfferController = require('../controllers/admin/adminOfferController');
const adminSalesReportController = require('../controllers/admin/adminSalesReportController');

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
router.get('/products/add/variant',adminAuthenticated,adminProduct.getAddvariant);
router.post('/products/add/variant', adminProduct.postAddvariant);

// Admin edit products
router.get('/products/:id/details',adminAuthenticated,adminProduct.getProductDetails);
router.post('/products/update/:id',adminAuthenticated,adminProduct.updateProduct);

// Admin edit Photo
router.get('/products/:id/image',adminAuthenticated,adminProduct.getEditProductImage);
router.post('/products/:id/image', uploadMiddleware,adminProduct.postEditProductImage);

// Add these routes if they don't exist
router.get('/products/:id/edit-images', adminProduct.getEditImages);
router.post('/products/:id/add-images', adminProduct.addNewImages);
router.post('/products/:id/update-image', adminProduct.updateProductImage);

router.post('/products/delete/:id', adminProduct.deleteProduct);

// Add this new route
router.post('/products/:id/delete-image', adminProduct.deleteProductImage);

// Product soft delete routes
router.post('/products/soft-delete/:id', adminAuthenticated, adminProduct.softDeleteProduct);
router.get('/products/archived', adminAuthenticated, adminProduct.getArchivedProducts);
router.post('/products/restore/:id', adminAuthenticated, adminProduct.restoreProduct);

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

// Category soft delete routes
router.post('/category/soft-delete/:id', adminAuthenticated, adminController.softDeleteCategory);
router.get('/category/archived', adminAuthenticated, adminController.getArchivedCategories);
router.post('/category/restore/:id', adminAuthenticated, adminController.restoreCategory);

// Order management routes
router.get('/orders', adminAuthenticated, adminOrderController.getAllOrders);
router.get('/order/:orderId', adminAuthenticated, adminOrderController.getOrderDetails);
router.post('/order/:orderId/status', adminAuthenticated, adminOrderController.updateOrderStatus);
router.post('/order/:orderId/return', adminAuthenticated, adminOrderController.processReturnRequest);
router.get('/order-stats', adminAuthenticated, adminOrderController.getOrderStats);

//  route for processing returns
router.post('/order/:orderId/process-return', adminAuthenticated, adminOrderController.processReturnRequest);

// Coupon routes
router.get('/coupon', adminAuthenticated, adminCouponController.getCoupons);
router.post('/coupon', adminAuthenticated, adminCouponController.createCoupon);
router.put('/coupon/:couponId', adminAuthenticated, adminCouponController.updateCoupon);
router.delete('/coupon/:couponId', adminAuthenticated, adminCouponController.deleteCoupon);
router.post('/coupon/:couponId/restore', adminAuthenticated, adminCouponController.restoreCoupon);
router.get('/coupon/archived', adminAuthenticated, adminCouponController.getArchivedCoupons);

// Offer routes
router.get('/offer', adminAuthenticated, adminOfferController.getOffers);
router.post('/offer', adminAuthenticated, adminOfferController.createOffer);
router.put('/offer/:offerId', adminAuthenticated, adminOfferController.updateOffer);
router.delete('/offer/:offerId', adminAuthenticated, adminOfferController.deleteOffer);
router.post('/offer/:offerId/restore', adminAuthenticated, adminOfferController.restoreOffer);
router.get('/offer/archived', adminAuthenticated, adminOfferController.getArchivedOffers);

// Sales Report Routes
router.get('/sales-report', adminSalesReportController.getSalesReportPage);
router.get('/api/sales-report', adminSalesReportController.getSalesReport);
router.get('/sales-report/download-pdf', adminSalesReportController.downloadPDFReport);
router.get('/sales-report/download-excel', adminSalesReportController.downloadExcelReport);

module.exports = router;
