const Order = require('../../Models/orderModel');
const Variant = require('../../Models/variantSchema');
const Product = require('../../Models/productSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Wallet = require('../../Models/walletModel');
const Cart = require('../../Models/cartModel');
const Address = require('../../Models/addressModel');
const Offer = require('../../Models/offerModel');

function isWithin7Days(deliveredAt) {
  const delivered = new Date(deliveredAt);
  const now = new Date();
  const diffTime = Math.abs(now - delivered);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 7;
}

// Get all orders for the user
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    // Search functionality
    const searchQuery = req.query.search || '';
    let query = { userId };
    
    if (searchQuery) {
      // First find products that match the search query
      const matchingProducts = await Product.find(
        { productName: { $regex: searchQuery, $options: 'i' } },
        { _id: 1 }
      );
      
      const productIds = matchingProducts.map(p => p._id);
      
      // Create search conditions
      const searchConditions = [
        { orderStatus: { $regex: searchQuery, $options: 'i' } },
        { paymentMethod: { $regex: searchQuery, $options: 'i' } }
      ];
      
      // Add product search if we found matching products
      if (productIds.length > 0) {
        searchConditions.push({ 'items.productId': { $in: productIds } });
      }
      
      // Add ObjectId search if valid format
      if (searchQuery.match(/^[0-9a-fA-F]{24}$/)) {
        searchConditions.push({ _id: searchQuery });
      }
      
      query = {
        userId,
        $or: searchConditions
      };
    }
    
    // Get orders with pagination
    const orders = await Order.find(query)
      .populate({
        path: 'items.productId',
        select: 'productName imageUrl'
      })
      .populate({
        path: 'items.variantId',
        select: 'variantType'
      })
      .populate('address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);
    
    // Add isWithin7Days property to each order
    const ordersWithReturnEligibility = orders.map(order => ({
      ...order.toObject(),
      isReturnEligible: order.orderStatus === 'delivered' && isWithin7Days(order.deliveredAt)
    }));

    res.render('user/orders', {
      orders: ordersWithReturnEligibility,
      currentPage: page,
      totalPages,
      searchQuery
    });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).render('error', { error: 'Failed to load orders' });
  }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user._id;
    
    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: 'items.productId',
        select: 'productName imageUrl'
      })
      .populate({
        path: 'items.variantId',
        select: 'variantType price discountPrice'
      })
      .populate('address');
    
    if (!order) {
      return res.status(404).render('error', { error: 'Order not found' });
    }
    
    // Add return eligibility check
    const isWithin7Days = (date) => {
      if (!date) return false;
      const deliveryDate = new Date(date);
      const currentDate = new Date();
      const daysDifference = Math.floor((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));
      return daysDifference <= 7;
    };
    
    // Add isReturnEligible property to the order
    const orderWithReturnEligibility = {
      ...order.toObject(),
      isReturnEligible: order.orderStatus === 'delivered' && isWithin7Days(order.deliveredAt)
    };
    
    res.render('user/orderDetails', { order: orderWithReturnEligibility });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).render('error', { error: 'Failed to load order details' });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.session.user._id;
    
    // Find the order
    const order = await Order.findOne({ _id: orderId, userId });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check if order can be cancelled
    const allowedStatuses = ['pending', 'processing'];
    if (!allowedStatuses.includes(order.orderStatus)) {
      return res.status(400).json({ 
        error: 'This order cannot be cancelled as it has already been shipped or delivered' 
      });
    }
    
    // Update order status
    order.orderStatus = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = reason || 'No reason provided';
    
    // If payment was made, initiate refund to wallet
    if (order.paymentStatus === 'paid') {
      order.refundStatus = 'completed';
      order.refundAmount = order.total;
      order.refundedAt = new Date();
      
      // Add refund to wallet
      let wallet = await Wallet.findOne({ userId });
      
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0 });
      }
      
      wallet.balance += order.total;
      wallet.transactions.push({
        amount: order.total,
        type: 'credit',
        description: `Refund for cancelled order #${order._id}`,
        orderId: order._id
      });
      
      await wallet.save();
    }
    
    await order.save();
    
    // Restore stock for all items
    for (const item of order.items) {
      await Variant.findByIdAndUpdate(
        item.variant,
        { $inc: { stock: item.quantity } }
      );
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Order cancelled successfully',
      refunded: order.paymentStatus === 'paid'
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    return res.status(500).json({ error: 'Failed to cancel order' });
  }
};

// Return order
exports.returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.session.user._id;

    if (!reason) {
      return res.status(400).json({ error: 'Return reason is required' });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({ error: 'Only delivered orders can be returned' });
    }

    // Update order with return request information
    order.returnRequested = true;
    order.returnRequestedAt = new Date();
    order.returnReason = reason;
    order.returnStatus = 'pending';
    
    await order.save();

    return res.status(200).json({ 
      success: true, 
      message: 'Return request submitted successfully' 
    });
  } catch (error) {
    console.error('Error submitting return request:', error);
    return res.status(500).json({ error: 'An error occurred while submitting your return request' });
  }
};

// Generate invoice
exports.generateInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user._id;
    
    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: 'items.product',
        select: 'productName'
      })
      .populate({
        path: 'items.variant',
        select: 'variantType price discountPrice'
      })
      .populate('address');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Create a PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);
    
    // Pipe the PDF to the response
    doc.pipe(res);
    
    // Add company logo and header
    doc.fontSize(20).text('L.MARK', { align: 'center' });
    doc.fontSize(12).text('Invoice', { align: 'center' });
    doc.moveDown();
    
    // Add order details
    doc.fontSize(14).text('Order Details');
    doc.fontSize(10).text(`Order ID: ${order._id}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Payment Method: ${order.paymentMethod.toUpperCase()}`);
    doc.text(`Payment Status: ${order.paymentStatus.toUpperCase()}`);
    doc.moveDown();
    
    // Add shipping address
    doc.fontSize(14).text('Shipping Address');
    doc.fontSize(10).text(`Name: ${order.address.fullName}`);
    doc.text(`Address: ${order.address.address}`);
    doc.text(`City: ${order.address.city}, ${order.address.state} - ${order.address.pincode}`);
    doc.text(`Mobile: ${order.address.mobile}`);
    doc.moveDown();
    
    // Add items table
    doc.fontSize(14).text('Order Items');
    doc.moveDown();
    
    // Table headers
    let y = doc.y;
    doc.fontSize(10).text('Item', 50, y);
    doc.text('Variant', 200, y);
    doc.text('Price', 300, y);
    doc.text('Qty', 350, y);
    doc.text('Total', 400, y);
    
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown();
    
    // Table rows
    order.items.forEach(item => {
      y = doc.y;
      const price = item.discountPrice > 0 ? item.discountPrice : item.price;
      const total = price * item.quantity;
      
      doc.fontSize(10).text(item.product.productName, 50, y, { width: 150 });
      doc.text(item.variant.variantType, 200, y);
      doc.text(`₹${price.toFixed(2)}`, 300, y);
      doc.text(item.quantity.toString(), 350, y);
      doc.text(`₹${total.toFixed(2)}`, 400, y);
      
      doc.moveDown();
    });
    
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    
    // Order summary
    doc.text(`Subtotal: ₹${order.subtotal.toFixed(2)}`, { align: 'right' });
    doc.text(`Shipping: ₹${order.shipping.toFixed(2)}`, { align: 'right' });
    if (order.discount > 0) {
      doc.text(`Discount: -₹${order.discount.toFixed(2)}`, { align: 'right' });
    }
    if (order.tax > 0) {
      doc.text(`Tax: ₹${order.tax.toFixed(2)}`, { align: 'right' });
    }
    doc.fontSize(12).text(`Total: ₹${order.total.toFixed(2)}`, { align: 'right' });
    
    doc.moveDown();
    doc.fontSize(10).text('Thank you for shopping with us!', { align: 'center' });
    
    // Finalize the PDF
    doc.end();
  } catch (error) {
    console.error('Generate invoice error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};

// Process return
exports.processReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { refundStatus, refundAmount } = req.body;
    
    // Validate inputs
    if (!orderId || !refundStatus) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update order with refund information
    order.refundStatus = refundStatus;
    if (refundStatus === 'completed' && refundAmount) {
      order.refundAmount = parseFloat(refundAmount);
    }
    
    // Save the updated order
    await order.save();
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'Return processed successfully' 
    });
  } catch (error) {
    console.error('Error processing return:', error);
    return res.status(500).json({ 
      error: 'An error occurred while processing the return' 
    });
  }
};

exports.checkout = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName imageUrl'
    });

    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    // Get variants and verify offers are still valid
    const currentDate = new Date();
    for (const item of cart.items) {
      const variant = await Variant.findById(item.variantId);
      
      // Check if variant exists and has stock
      if (!variant || variant.stock < item.quantity) {
        return res.redirect('/cart?error=stock_changed');
      }
      
      // If item has an offer, verify it's still valid
      if (item.offer) {
        const offer = await Offer.findOne({
          _id: item.offer.offerId,
          isActive: true,
          isDeleted: false,
          startDate: { $lte: currentDate },
          endDate: { $gte: currentDate }
        });
        
        if (!offer) {
          // Offer no longer valid, update price
          item.finalPrice = item.price;
          item.offer = null;
        } else if (offer.discountPercentage !== item.offer.discountPercentage) {
          // Discount changed, update price
          const discountAmount = (item.price * offer.discountPercentage) / 100;
          item.finalPrice = Math.round(item.price - discountAmount);
          item.offer.discountPercentage = offer.discountPercentage;
        }
      }
    }
    
    // Recalculate cart total
    cart.totalAmount = cart.items.reduce(
      (total, item) => total + (item.finalPrice * item.quantity), 
      0
    );
    
    await cart.save();

    // Get addresses for checkout
    const addresses = await Address.find({ userId });

    res.render('user/checkout', {
      cart,
      addresses,
      // Other data needed for checkout
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', { error: 'Failed to load checkout page' });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId, paymentMethod } = req.body;
    
    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    
    // Verify all items are in stock and offers are valid
    const currentDate = new Date();
    const orderItems = [];
    let subtotal = 0;
    
    for (const item of cart.items) {
      const variant = await Variant.findById(item.variantId);
      const product = await Product.findById(item.productId);
      
      if (!variant || !product || variant.stock < item.quantity) {
        return res.status(400).json({ 
          success: false, 
          message: `${product ? product.productName : 'Item'} is no longer available in the requested quantity` 
        });
      }
      
      // Verify offers again
      let finalPrice = item.price;
      let appliedOffer = null;
      
      if (item.offer) {
        const offer = await Offer.findOne({
          _id: item.offer.offerId,
          isActive: true,
          isDeleted: false,
          startDate: { $lte: currentDate },
          endDate: { $gte: currentDate }
        });
        
        if (offer) {
          const discountAmount = (item.price * offer.discountPercentage) / 100;
          finalPrice = Math.round(item.price - discountAmount);
          
          appliedOffer = {
            offerId: offer._id,
            title: offer.title,
            discountPercentage: offer.discountPercentage
          };
        }
      }
      
      // Add to order items
      orderItems.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price,
        finalPrice: finalPrice,
        offer: appliedOffer
      });
      
      // Add to subtotal
      subtotal += finalPrice * item.quantity;
      
      // Update inventory
      variant.stock -= item.quantity;
      await variant.save();
    }
    
    // Create order
    const order = new Order({
      userId,
      items: orderItems,
      totalAmount: subtotal,
      shippingAddress: addressId,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'completed',
      orderStatus: 'placed'
    });
    
    await order.save();
    
    // Clear cart
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [], totalAmount: 0 } }
    );
    
    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: order._id
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'Failed to place order' });
  }
}; 