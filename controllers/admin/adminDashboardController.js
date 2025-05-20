const Order = require('../../Models/orderModel');
const User = require('../../Models/userModel');
const Product = require('../../Models/productSchema');
const Category = require('../../Models/categoryModel');

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
    
    res.render('admin/adminDashboard', {
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

// 1. Total sales grouped by month or year
exports.getSalesAnalytics = async (req, res) => {
  try {
    const { type = 'monthly', year = new Date().getFullYear(), month } = req.query;
    
    let match = { orderStatus: 'delivered' };
    
    // Add year filter
    if (year) {
      const yearNum = parseInt(year);
      match.createdAt = { 
        $gte: new Date(`${yearNum}-01-01`), 
        $lte: new Date(`${yearNum}-12-31`) 
      };
    }
    
    // Add month filter if provided
    if (month) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      
      if (monthNum >= 1 && monthNum <= 12) {
        // Get first and last day of the month
        const firstDay = new Date(yearNum, monthNum - 1, 1);
        const lastDay = new Date(yearNum, monthNum, 0);
        
        match.createdAt = { 
          $gte: firstDay, 
          $lte: lastDay 
        };
      }
    }
    
    let groupId, dateFormat;
    if (type === 'yearly') {
      groupId = { year: { $year: '$createdAt' } };
      dateFormat = '%Y';
    } else {
      groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
      dateFormat = '%Y-%m';
    }
    
    const sales = await Order.aggregate([
      { $match: match },
      { $group: {
        _id: groupId,
        totalSales: { $sum: '$total' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    res.json(sales);
  } catch (err) {
    console.error('Error fetching sales analytics:', err);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
};

// 2. Top 10 best-selling products
exports.getTopProducts = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    let match = {};
    
    // Add date filters if provided
    if (year) {
      const yearNum = parseInt(year);
      match.createdAt = { 
        $gte: new Date(`${yearNum}-01-01`), 
        $lte: new Date(`${yearNum}-12-31`) 
      };
      
      // Further filter by month if provided
      if (month) {
        const monthNum = parseInt(month);
        if (monthNum >= 1 && monthNum <= 12) {
          // Get first and last day of the month
          const firstDay = new Date(yearNum, monthNum - 1, 1);
          const lastDay = new Date(yearNum, monthNum, 0);
          
          match.createdAt = { 
            $gte: firstDay, 
            $lte: lastDay 
          };
        }
      }
    }
    
    const pipeline = [
      // Match orders by date if filters provided
      ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
      // Unwind items array
      { $unwind: '$items' },
      // Group by product
      { $group: {
        _id: '$items.productId',
        totalQuantity: { $sum: '$items.quantity' }
      }},
      // Sort by quantity sold
      { $sort: { totalQuantity: -1 } },
      // Limit to top 10
      { $limit: 10 },
      // Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      // Filter out non-existent products
      { $match: { "product.0": { $exists: true } } },
      // Unwind product array
      { $unwind: '$product' },
      // Project final fields
      { $project: { productName: '$product.productName', totalQuantity: 1 } }
    ];
    
    const topProducts = await Order.aggregate(pipeline);
    res.json(topProducts);
  } catch (err) {
    console.error('Error fetching top products:', err);
    res.status(500).json({ error: 'Failed to fetch top products' });
  }
};

// 3. Top 10 categories
exports.getTopCategories = async (req, res) => {
  try {
    const topCategories = await Order.aggregate([
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $group: {
        _id: '$product.category',
        totalQuantity: { $sum: '$items.quantity' }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);
    res.json(topCategories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch top categories' });
  }
};

// 4. Top 10 brands
exports.getTopBrands = async (req, res) => {
  try {
    const topBrands = await Order.aggregate([
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $group: {
        _id: '$product.brand',
        totalQuantity: { $sum: '$items.quantity' }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);
    res.json(topBrands);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch top brands' });
  }
}; 