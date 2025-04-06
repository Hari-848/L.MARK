const Cart = require('../../Models/cartModel');
const Address = require('../../Models/addressModel');
const Order = require('../../Models/orderModel');
const Product = require('../../Models/productSchema');
const Variant = require('../../Models/variantSchema');
const Category = require('../../Models/categoryModel');
const razorpay = require('../../config/razorpay');
const crypto = require('crypto');
const Wallet = require('../../Models/walletModel');
const User = require('../../Models/userModel');
const Coupon = require('../../Models/couponModel');
const mongoose = require('mongoose');

// Get checkout page
exports.getCheckout = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/signin');
    }
    
    // Get cart with populated items
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.product',
        select: 'productName imageUrl'
      })
      .populate({
        path: 'items.variant',
        select: 'variantType price discountPrice stock'
      });
    
    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }
    
    // Calculate original subtotal (before any discounts)
    const subtotal = cart.items.reduce((total, item) => {
      const itemPrice = item.variant.price || item.price;
      return total + (itemPrice * item.quantity);
    }, 0);

    // Calculate product discounts (from variant discountPrice)
    const productDiscount = cart.items.reduce((total, item) => {
      if (item.variant.discountPrice && item.variant.discountPrice > 0) {
        const originalPrice = item.variant.price || item.price;
        const discount = (originalPrice - item.variant.discountPrice) * item.quantity;
        return total + discount;
      }
      return total;
    }, 0);

    const shipping = 0; // Free shipping
    
    // Get applied coupon from session
    const appliedCoupon = req.session.appliedCoupon;
    const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0;

    // Calculate final total
    const total = subtotal - productDiscount - couponDiscount + shipping;
    
    // Get user addresses
    const addresses = await Address.find({ userId });
    
    // Get wallet balance
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = { balance: 0 };
    }
    
    res.render('user/checkout', {
      cart,
      addresses,
      subtotal,
      shipping,
      discount: productDiscount,
      couponDiscount,
      appliedCoupon,
      total,
      cartTotal: total,
      wallet,
      user: {
        name: user.fullName,
        email: user.email,
        mobile: user.mobile || ''
      }
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).render('error', { error: 'Failed to load checkout page' });
  }
};

// Place order
exports.placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.session.user._id;

    // Validate address
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(400).json({ error: 'Address not found' });
    }
    
    // Get cart with populated items
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.product',
        select: 'name'
      })
      .populate({
        path: 'items.variant',
        select: 'price discountPrice stock'
      });
      
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Calculate totals
    const orderItems = cart.items.map(item => ({
      product: item.product._id,
      variant: item.variant._id,
      quantity: item.quantity,
      price: item.variant.discountPrice || item.variant.price
    }));

    const subtotal = cart.items.reduce((total, item) => {
      return total + ((item.variant.discountPrice || item.variant.price) * item.quantity);
    }, 0);

    const shipping = 0;
    const tax = 0;
    const appliedCoupon = req.session.appliedCoupon;
    const discount = appliedCoupon ? appliedCoupon.discount : 0;
    const total = subtotal + shipping + tax - discount;

    // If coupon was used, verify usage limit again before placing order
    if (appliedCoupon) {
      const coupon = await Coupon.findById(appliedCoupon.couponId);
      if (!coupon) {
        return res.status(400).json({ error: 'Invalid coupon' });
      }

      const userUsage = coupon.usedBy.filter(usage => 
        usage.userId.toString() === userId.toString()
      ).length;

      if (userUsage >= coupon.usageLimit) {
        return res.status(400).json({ error: 'You have already used this coupon the maximum number of times' });
      }
    }

    // Handle wallet payment
    if (paymentMethod === 'wallet') {
      try {
        // Check wallet and balance
        const wallet = await Wallet.findOne({ userId });
        if (!wallet) {
          return res.status(400).json({ error: 'Wallet not found' });
        }

        if (wallet.balance < total) {
          return res.status(400).json({ error: 'Insufficient wallet balance' });
        }

        // Create order first
        const order = new Order({
          userId,
          address: addressId,
          items: orderItems,
          subtotal,
          shipping,
          discount,
          tax,
          total,
          paymentMethod: 'wallet',
          paymentStatus: 'paid',
          orderStatus: 'pending',
          coupon: appliedCoupon ? appliedCoupon.couponId : null
        });

        // Validate order before saving
        const validationError = order.validateSync();
        if (validationError) {
          throw new Error(validationError.message);
        }

        await order.save();

        // Update wallet balance
        wallet.balance -= total;
        wallet.transactions.push({
          type: 'debit',
          amount: total,
          description: `Payment for order #${order._id}`,
          orderId: order._id
        });
        await wallet.save();

        // Update stock
        for (const item of cart.items) {
          await Variant.findByIdAndUpdate(
            item.variant._id,
            { $inc: { stock: -item.quantity } }
          );
        }

        // If coupon was used, update its usage count
        if (appliedCoupon && appliedCoupon.couponId) {
          await Coupon.findByIdAndUpdate(
            appliedCoupon.couponId,
            {
              $push: {
                usedBy: {
                  userId: userId,
                  usedAt: new Date(),
                  orderId: order._id
                }
              }
            }
          );
        }

        // Clear cart
        await Cart.findOneAndUpdate(
          { userId },
          { $set: { items: [] } }
        );

        // Clear coupon from session
        delete req.session.appliedCoupon;
        await new Promise((resolve, reject) => {
          req.session.save(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        return res.json({
          success: true,
          orderId: order._id,
          paymentMethod: 'wallet',
          redirectUrl: `/order/success/${order._id}`
        });

      } catch (error) {
        console.error('Wallet payment error:', error);
        return res.status(400).json({ 
          error: error.message || 'Failed to process wallet payment'
        });
      }
    }

    // For other payment methods (COD or online), create pending order
    const order = new Order({
      userId,
      address: addressId,
      items: orderItems,
      subtotal,
      shipping,
      discount,
      tax,
      total,
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      coupon: appliedCoupon ? appliedCoupon.couponId : null
    });

    await order.save();

    if (paymentMethod === 'cod') {
      // Update stock and clear cart for COD
      for (const item of cart.items) {
        await Variant.findByIdAndUpdate(
          item.variant._id,
          { $inc: { stock: -item.quantity } }
        );
      }
      
      // If coupon was used, update its usage count
      if (appliedCoupon && appliedCoupon.couponId) {
        await Coupon.findByIdAndUpdate(
          appliedCoupon.couponId,
          {
            $push: {
              usedBy: {
                userId: userId,
                usedAt: new Date(),
                orderId: order._id
              }
            }
          }
        );
      }

      await Cart.findOneAndUpdate(
        { userId },
        { $set: { items: [] } }
      );

      // Clear coupon from session
      delete req.session.appliedCoupon;
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({
        success: true,
        orderId: order._id,
        paymentMethod: 'cod'
      });
    } else {
      // Create Razorpay order for online payment
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: 'INR',
        receipt: order._id.toString()
      });

      return res.json({
        success: true,
        orderId: order._id,
        paymentMethod: 'online',
        key_id: process.env.RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        razorpayOrderId: razorpayOrder.id
      });
    }

  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({ error: 'Failed to place order' });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    
    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
    
    // Find and update order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update order status
    order.paymentStatus = 'paid';
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();
    
    // Update product stock
    for (const item of order.items) {
      await Variant.findByIdAndUpdate(
        item.variant,
        { $inc: { stock: -item.quantity } }
      );
    }
    
    // Clear cart
    await Cart.findOneAndUpdate(
      { userId: order.userId },
      { $set: { items: [] } }
    );
    
    return res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order._id
    });
    
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// Payment failure handler
exports.paymentFailure = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    // Find and update order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update order status
    order.paymentStatus = 'failed';
    await order.save();
    
    return res.json({
      success: true,
      message: 'Payment failure recorded',
      orderId: order._id
    });
    
  } catch (error) {
    console.error('Payment failure error:', error);
    res.status(500).json({ error: 'Failed to record payment failure' });
  }
};

// Order success page
exports.getOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user._id;
    
    const order = await Order.findOne({ _id: orderId, userId })
      .populate('address');
    
    if (!order) {
      return res.redirect('/orders');
    }
    
    res.render('user/orderSuccess', { order });
  } catch (error) {
    console.error('Order success error:', error);
    res.status(500).render('error', { error: 'Failed to load order success page' });
  }
};

// Order failure page
exports.getOrderFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user._id;
    
    const order = await Order.findOne({ _id: orderId, userId });
    
    if (!order) {
      return res.redirect('/orders');
    }
    
    res.render('user/orderFailure', { order });
  } catch (error) {
    console.error('Order failure error:', error);
    res.status(500).render('error', { error: 'Failed to load order failure page' });
  }
};

// Apply coupon
exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user._id;

    if (!couponCode) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    // Find coupon
    const coupon = await Coupon.findOne({ 
      code: couponCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    });

    if (!coupon) {
      return res.status(400).json({ error: 'Invalid or expired coupon' });
    }

    // Check if user has already used this coupon
    const userUsage = coupon.usedBy.filter(usage => 
      usage.userId.toString() === userId.toString()
    ).length;

    if (userUsage >= coupon.usageLimit) {
      return res.status(400).json({ error: 'You have already used this coupon the maximum number of times' });
    }

    // Get cart total
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.variant',
        select: 'discountPrice price'
      });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty' });
    }

    const subtotal = cart.items.reduce((total, item) => {
      const itemPrice = (item.variant.discountPrice && item.variant.discountPrice > 0) 
        ? item.variant.discountPrice 
        : item.variant.price;
      return total + (itemPrice * item.quantity);
    }, 0);

    // Check minimum purchase requirement
    if (subtotal < coupon.minPurchase) {
      return res.status(400).json({ 
        error: `Minimum purchase of ₹${coupon.minPurchase} required` 
      });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (subtotal * coupon.discountAmount) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = Math.min(coupon.discountAmount, subtotal); // Don't allow discount more than subtotal
    }

    // Check if this coupon is already applied in the current session
    if (req.session.appliedCoupon && req.session.appliedCoupon.code === coupon.code) {
      return res.status(400).json({ error: 'This coupon is already applied' });
    }

    // Store coupon in session
    req.session.appliedCoupon = {
      code: coupon.code,
      discount: discount,
      couponId: coupon._id,
      usageCount: userUsage + 1 // Track current usage count
    };

    // Save session explicitly to ensure it's updated
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.json({
      success: true,
      discount: discount,
      message: 'Coupon applied successfully',
      remainingUses: coupon.usageLimit - (userUsage + 1)
    });

  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({ error: 'Failed to apply coupon' });
  }
};

// Remove coupon
exports.removeCoupon = async (req, res) => {
  try {
    // Remove coupon from session
    delete req.session.appliedCoupon;

    // Save session explicitly to ensure it's updated
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.json({
      success: true,
      message: 'Coupon removed successfully'
    });
  } catch (error) {
    console.error('Remove coupon error:', error);
    res.status(500).json({ error: 'Failed to remove coupon' });
  }
};

// Get available coupons
exports.getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const currentDate = new Date();

    // Get cart total to check minimum purchase requirements
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.variant',
        select: 'discountPrice price'
      });

    if (!cart || cart.items.length === 0) {
      return res.json([]);
    }

    const cartTotal = cart.items.reduce((total, item) => {
      const itemPrice = (item.variant.discountPrice && item.variant.discountPrice > 0) 
        ? item.variant.discountPrice 
        : item.variant.price;
      return total + (itemPrice * item.quantity);
    }, 0);

    // Find valid coupons
    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      validFrom: { $lte: currentDate },
      validUntil: { $gte: currentDate },
      minPurchase: { $lte: cartTotal }
    });

    // Filter out coupons that the user has already used up
    const availableCoupons = coupons.filter(coupon => {
      const userUsage = coupon.usedBy.filter(usage => 
        usage.userId.toString() === userId.toString()
      ).length;
      return userUsage < coupon.usageLimit;
    });

    // Format coupons for display
    const formattedCoupons = availableCoupons.map(coupon => ({
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountAmount: coupon.discountAmount,
      minPurchase: coupon.minPurchase,
      maxDiscount: coupon.maxDiscount,
      validUntil: coupon.validUntil,
      usageLimit: coupon.usageLimit,
      remainingUses: coupon.usageLimit - coupon.usedBy.filter(usage => 
        usage.userId.toString() === userId.toString()
      ).length
    }));

    res.json(formattedCoupons);
  } catch (error) {
    console.error('Get available coupons error:', error);
    res.status(500).json({ error: 'Failed to fetch available coupons' });
  }
};

exports.clearCheckoutSession = async (req, res) => {
  try {
    // Clear the applied coupon from session
    delete req.session.appliedCoupon;
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Clear checkout session error:', error);
    res.status(500).json({ error: 'Failed to clear checkout session' });
  }
}; 