const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Variant',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  discountPrice: {
    type: Number,
    default: 0
  }
});

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'online'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  subtotal: {
    type: Number,
    required: true
  },
  shipping: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  trackingNumber: {
    type: String
  },
  deliveredAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  returnedAt: {
    type: Date
  },
  cancelReason: {
    type: String
  },
  returnReason: {
    type: String
  },
  refundStatus: {
    type: String,
    enum: ['pending', 'completed', 'rejected'],
  },
  refundAmount: {
    type: Number
  },
  refundedAt: {
    type: Date
  },
  isReturnEligible: {
    type: Boolean,
    default: false
  },
  returnRequested: { type: Boolean, default: false },
  returnRequestedAt: Date,
  returnStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);