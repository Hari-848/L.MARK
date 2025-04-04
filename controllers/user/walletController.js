const Wallet = require('../../Models/walletModel');
const Order = require('../../Models/orderModel');
const razorpay = require('../../config/razorpay');
const crypto = require('crypto');

// Get wallet details
exports.getWallet = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    // Find or create wallet
    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
      await wallet.save();
    }
    
    res.render('user/wallet', { wallet });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).render('error', { error: 'Failed to load wallet details' });
  }
};

// Use wallet balance for payment
exports.useWalletForPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user._id;
    
    // Find order
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Find wallet
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    // Check if wallet has enough balance
    if (wallet.balance < order.total) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }
    
    // Update wallet balance
    wallet.balance -= order.total;
    wallet.transactions.push({
      amount: order.total,
      type: 'debit',
      description: `Payment for order #${order._id}`,
      orderId: order._id
    });
    
    await wallet.save();
    
    // Update order status
    order.paymentMethod = 'wallet';
    order.paymentStatus = 'paid';
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
      { userId },
      { $set: { items: [] } }
    );
    
    res.json({
      success: true,
      message: 'Payment completed using wallet balance',
      orderId: order._id
    });
  } catch (error) {
    console.error('Use wallet for payment error:', error);
    res.status(500).json({ error: 'Failed to process payment using wallet' });
  }
};

// Add money to wallet
exports.addMoney = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.session.user._id;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `wallet_recharge_${Date.now()}`
    });

    res.json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount
    });

  } catch (error) {
    console.error('Add money error:', error);
    res.status(500).json({ error: 'Failed to process add money request' });
  }
};

// Verify wallet payment
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const userId = req.session.user._id;

    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Get order details from Razorpay
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const amount = order.amount / 100; // Convert from paise to rupees

    // Update wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
    }

    wallet.balance += amount;
    wallet.transactions.push({
      amount,
      type: 'credit',
      description: 'Wallet recharge',
      paymentId: razorpay_payment_id
    });

    await wallet.save();

    res.json({
      success: true,
      message: 'Payment verified and wallet updated successfully'
    });

  } catch (error) {
    console.error('Verify wallet payment error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};