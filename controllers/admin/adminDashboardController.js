const Order = require('../../Models/orderModel');
const User = require('../../Models/userModel');
const Product = require('../../Models/productSchema');

exports.getDashboard = async (req, res) => {
  try {
    // Get user count
    const userCount = await User.countDocuments();
    
    // Get product count
    const productCount = await Product.countDocuments();
    
    // Get order statistics
    const orderStats = {
      total: 0,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0,
      revenue: 0
    };
    
    // Get order counts by status
    const orderStatusCounts = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);
    
    // Calculate total orders and revenue
    orderStatusCounts.forEach(status => {
      orderStats.total += status.count;
      
      if (status._id === 'delivered' || status._id === 'shipped') {
        orderStats.revenue += status.totalAmount;
      }
      
      orderStats[status._id] = status.count;
    });
    
    // Get recent orders
    const recentOrders = await Order.find()
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      userCount,
      productCount,
      orderStats,
      recentOrders
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { 
      message: 'Failed to load dashboard' 
    });
  }
}; 