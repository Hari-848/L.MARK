const Cart = require('../../Models/cartModel');
const Address = require('../../Models/addressModel');
const Order = require('../../Models/orderModel');
const Product = require('../../Models/productSchema');
const Variant = require('../../Models/variantSchema');

// Get checkout page
exports.getCheckout = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    // Get cart with populated product and variant details
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.product',
        select: 'productName imageUrl status'
      })
      .populate({
        path: 'items.variant',
        select: 'variantType price discountPrice stock'
      });
    
    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }
    
    // Get user addresses
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    
    // Calculate cart total with discounts
    const cartTotal = cart.items.reduce((total, item) => {
      const itemPrice = (item.variant.discountPrice && item.variant.discountPrice > 0) 
        ? item.variant.discountPrice 
        : item.price;
      return total + (itemPrice * item.quantity);
    }, 0);
    
    // Calculate other values
    const shipping = 0; // Free shipping
    const discount = 0; // No discount applied yet
    const tax = 0; // No tax
    const orderTotal = cartTotal + shipping - discount;
    
    res.render('user/checkout', {
      cart,
      addresses,
      cartTotal,
      shipping,
      discount,
      tax,
      orderTotal
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
      return res.status(404).json({ error: 'Address not found' });
    }
    
    // Get cart with populated product and variant details
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.product',
        select: 'productName imageUrl status'
      })
      .populate({
        path: 'items.variant',
        select: 'variantType price discountPrice stock'
      });
    
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty' });
    }
    
    // Validate stock for all items
    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant._id);
      
      if (!variant || variant.stock < item.quantity) {
        return res.status(400).json({ 
          error: `${item.product.productName} is out of stock or has insufficient quantity` 
        });
      }
    }
    
    // Calculate totals
    const subtotal = cart.items.reduce((total, item) => {
      const itemPrice = (item.variant.discountPrice && item.variant.discountPrice > 0) 
        ? item.variant.discountPrice 
        : item.price;
      return total + (itemPrice * item.quantity);
    }, 0);
    
    const shipping = 0; // Free shipping
    const discount = 0; // No discount applied
    const tax = 0; // No tax
    const total = subtotal + shipping - discount;
    
    // Create order items
    const orderItems = cart.items.map(item => {
      const price = item.price;
      const discountPrice = (item.variant.discountPrice && item.variant.discountPrice > 0) 
        ? item.variant.discountPrice 
        : 0;
      
      return {
        product: item.product._id,
        variant: item.variant._id,
        quantity: item.quantity,
        price: price,
        discountPrice: discountPrice
      };
    });
    
    // Create new order
    const newOrder = new Order({
      userId,
      items: orderItems,
      address: addressId,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      orderStatus: 'pending',
      subtotal,
      shipping,
      discount,
      tax,
      total
    });
    
    await newOrder.save();
    
    // Update product stock
    for (const item of cart.items) {
      await Variant.findByIdAndUpdate(
        item.variant._id,
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
      message: 'Order placed successfully',
      orderId: newOrder._id
    });
  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({ error: 'Failed to place order' });
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