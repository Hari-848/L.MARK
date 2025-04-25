const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  description: {
    type: String,
    required: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountAmount: {
    type: Number,
    required: true
  },
  minPurchase: {
    type: Number,
    default: 0
  },
  maxDiscount: {
    type: Number
  },
  validFrom: {
    type: Date,
    required: true
  },
  validUntil: {
    type: Date,
    required: true
  },
  usageLimit: {
    type: Number,
    default: 1,
    min: 1,
    max: 100
  },
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    status: {
      type: String,
      enum: ['applied', 'completed', 'cancelled'],
      default: 'applied'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, { 
  timestamps: true,
  methods: {
    async canBeUsedByUser(userId) {
      const userUsage = this.usedBy.filter(usage => 
        usage.userId.toString() === userId.toString() && 
        usage.status !== 'cancelled'
      ).length;
      
      return userUsage < this.usageLimit;
    },
    async getRemainingUses(userId) {
      const userUsage = this.usedBy.filter(usage => 
        usage.userId.toString() === userId.toString() && 
        usage.status !== 'cancelled'
      ).length;
      
      return this.usageLimit - userUsage;
    }
  }
});

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;
