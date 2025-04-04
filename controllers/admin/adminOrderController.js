const Order = require('../../Models/orderModel');
const Variant = require('../../Models/variantSchema');
const User = require('../../Models/userModel');
const mongoose = require('mongoose');
const Wallet = require('../../Models/walletModel');

// Get all orders with search, sort, filter, pagination
exports.getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    // Search functionality
    const searchQuery = req.query.search || '';
    const status = req.query.status || '';
    const paymentMethod = req.query.paymentMethod || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';
    const returnStatus = req.query.returnStatus || '';
    
    // Build query
    let query = {};
    
    // Status filter
    if (status) {
      query.orderStatus = status;
    }
    
    // Payment method filter
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }
    
    // Search by order ID, user email, or product name
    if (searchQuery) {
      // Check if search query is a valid ObjectId
      const isValidObjectId = mongoose.Types.ObjectId.isValid(searchQuery);
      
      // Find users that match the search query
      const users = await User.find(
        { email: { $regex: searchQuery, $options: 'i' } },
        { _id: 1 }
      );
      
      const userIds = users.map(user => user._id);
      
      // Create search conditions
      const searchConditions = [
        { orderStatus: { $regex: searchQuery, $options: 'i' } },
        { paymentMethod: { $regex: searchQuery, $options: 'i' } }
      ];
      
      // Add user search if we found matching users
      if (userIds.length > 0) {
        searchConditions.push({ userId: { $in: userIds } });
      }
      
      // Add ObjectId search if valid format
      if (isValidObjectId) {
        searchConditions.push({ _id: searchQuery });
      }
      
      query.$or = searchConditions;
    }
    
    // Add return status filter
    if (returnStatus) {
      query.returnRequested = true;
      query.returnStatus = returnStatus;
    }
    
    // Get orders with pagination
    const orders = await Order.find(query)
      .populate('userId', 'email name')
      .populate({
        path: 'items.product',
        select: 'productName imageUrl'
      })
      .populate('address')
      .select('_id createdAt total paymentMethod paymentStatus orderStatus returnRequested returnStatus')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);
    
    // Get order statistics
    const orderStats = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);
    
    const stats = {
      total: totalOrders,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0,
      totalRevenue: 0
    };
    
    orderStats.forEach(stat => {
      if (stat._id) {
        stats[stat._id] = stat.count;
        if (stat._id === 'delivered' || stat._id === 'shipped') {
          stats.totalRevenue += stat.totalAmount;
        }
      }
    });
    
    res.render('admin/adminOrders', {
      orders,
      currentPage: page,
      totalPages,
      searchQuery,
      status,
      paymentMethod,
      sortBy,
      sortOrder,
      returnStatus,
      stats
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).render('error', { error: 'Failed to load orders' });
  }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId)
      .populate('userId', 'email name')
      .populate({
        path: 'items.product',
        select: 'productName imageUrl'
      })
      .populate({
        path: 'items.variant',
        select: 'variantType price discountPrice'
      })
      .populate('address');
    
    if (!order) {
      return res.status(404).render('error', { error: 'Order not found' });
    }
    
    order.shippingCost = order.shippingCost || 0;
    order.discount = order.discount || 0;
    
    res.render('admin/adminOrderDetails', { order });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).render('error', { error: 'Failed to load order details' });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Validate status transition
    const validTransitions = {
      pending: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: [],
      returned: []
    };
    
    if (!validTransitions[order.orderStatus].includes(status)) {
      return res.status(400).json({ 
        error: `Cannot change status from ${order.orderStatus} to ${status}` 
      });
    }
    
    // Update order status
    order.orderStatus = status;
    
    // Set timestamp based on status
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      
      // Update payment status for COD orders
      if (order.paymentMethod === 'cod' && order.paymentStatus === 'pending') {
        order.paymentStatus = 'paid';
      }
    } else if (status === 'cancelled') {
      order.cancelledAt = new Date();
      
      // Restore inventory for cancelled orders
      for (const item of order.items) {
        await Variant.findByIdAndUpdate(
          item.variant,
          { $inc: { stock: item.quantity } }
        );
      }
    }
    
    await order.save();
    
    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

// Process return request
exports.processReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { refundStatus, refundAmount: requestedRefundAmount } = req.body;
    
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check if return was requested
    if (!order.returnRequested) {
      return res.status(400).json({ error: 'No return request found for this order' });
    }
    
    if (refundStatus === 'completed') {
      // Approve return with refund
      order.orderStatus = 'returned';
      order.returnStatus = 'approved';
      order.refundStatus = 'completed';
      
      // Use the requested refund amount or default to order total
      const refundAmount = requestedRefundAmount ? parseFloat(requestedRefundAmount) : order.total;
      order.refundAmount = refundAmount;
      order.refundedAt = new Date();
      
      // Add refund to user's wallet
      const userId = order.userId;
      let wallet = await Wallet.findOne({ userId });
      
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0 });
      }
      
      wallet.balance += refundAmount;
      wallet.transactions.push({
        amount: refundAmount,
        type: 'credit',
        description: `Refund for returned order #${order._id}`,
        orderId: order._id
      });
      
      await wallet.save();
      
      // Restore stock for all items
      for (const item of order.items) {
        await Variant.findByIdAndUpdate(
          item.variant,
          { $inc: { stock: item.quantity } }
        );
      }
    } else if (refundStatus === 'rejected') {
      // Reject return request
      order.returnStatus = 'rejected';
      order.refundStatus = 'rejected';
      // Keep order status as delivered
    } else {
      return res.status(400).json({ error: 'Invalid refund status' });
    }
    
    await order.save();
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'Return processed successfully' 
    });
  } catch (error) {
    console.error('Process return request error:', error);
    return res.status(500).json({ 
      error: 'An error occurred while processing the return' 
    });
  }
};

// Get order statistics
exports.getOrderStats = async (req, res) => {
  try {
    // Get order statistics by status
    const orderStats = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);
    
    // Get daily orders for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const dailyOrders = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: { 
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } 
          },
          count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    res.json({
      orderStats,
      dailyOrders
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ error: 'Failed to get order statistics' });
  }
}; 