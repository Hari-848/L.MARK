const Coupon = require('../../Models/couponModel');

exports.getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Number of coupons per page
    const skip = (page - 1) * limit;

    const totalCoupons = await Coupon.countDocuments({ isDeleted: false });
    const totalPages = Math.ceil(totalCoupons / limit);

    const coupons = await Coupon.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render('admin/coupons', { 
      coupons,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).render('error', { error: 'Failed to load coupons' });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountAmount,
      minPurchase,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit
    } = req.body;

    // Validate required fields
    if (!code || !discountType || !discountAmount || !validFrom || !validUntil || !usageLimit) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Validate coupon code format
    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      return res.status(400).json({ error: 'Coupon code must be 4-10 characters long and contain only uppercase letters and numbers' });
    }

    // Validate dates
    const validFromDate = new Date(validFrom);
    const validUntilDate = new Date(validUntil);
    
    // Set both dates to start of day for proper comparison
    validFromDate.setHours(0, 0, 0, 0);
    validUntilDate.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (validUntilDate <= validFromDate) {
      return res.status(400).json({ error: 'Valid until date must be after valid from date' });
    }

    // Validate date ranges
    if (validFromDate.getTime() < today.getTime()) {
      return res.status(400).json({ error: 'Valid from date cannot be before today' });
    }

    const maxValidUntil = new Date();
    maxValidUntil.setFullYear(maxValidUntil.getFullYear() + 1);
    maxValidUntil.setHours(0, 0, 0, 0);
    if (validUntilDate > maxValidUntil) {
      return res.status(400).json({ error: 'Coupon validity cannot exceed 1 year' });
    }

    // Validate discount amount
    if (discountType === 'percentage' && (discountAmount <= 0 || discountAmount > 100)) {
      return res.status(400).json({ error: 'Percentage discount must be between 0 and 100' });
    }
    if (discountType === 'fixed' && discountAmount <= 0) {
      return res.status(400).json({ error: 'Fixed discount amount must be greater than 0' });
    }

    // Validate minimum purchase
    if (minPurchase && minPurchase < 0) {
      return res.status(400).json({ error: 'Minimum purchase amount cannot be negative' });
    }

    // Validate maximum discount
    if (maxDiscount && maxDiscount < 0) {
      return res.status(400).json({ error: 'Maximum discount amount cannot be negative' });
    }

    // Validate minimum purchase vs maximum discount
    if (maxDiscount && minPurchase && maxDiscount > minPurchase) {
      return res.status(400).json({ error: 'Maximum discount cannot be greater than minimum purchase amount' });
    }

    // Validate usage limit
    if (usageLimit < 1) {
      return res.status(400).json({ error: 'Usage limit must be at least 1' });
    }
    if (usageLimit > 100) {
      return res.status(400).json({ error: 'Usage limit cannot exceed 100 per user' });
    }

    // Enhanced discount validations
    if (discountType === 'fixed') {
      // For fixed amount discounts
      if (minPurchase && discountAmount > minPurchase) {
        return res.status(400).json({ error: 'Discount amount cannot be greater than minimum purchase amount' });
      }
      
      if (maxDiscount) {
        if (maxDiscount > minPurchase) {
          return res.status(400).json({ error: 'Maximum discount cannot be greater than minimum purchase amount' });
        }
        if (discountAmount > maxDiscount) {
          return res.status(400).json({ error: 'Discount amount cannot be greater than maximum discount' });
        }
      }
    } else if (discountType === 'percentage') {
      // For percentage discounts
      if (minPurchase && maxDiscount) {
        const calculatedMaxDiscount = (minPurchase * discountAmount) / 100;
        if (maxDiscount > calculatedMaxDiscount) {
          return res.status(400).json({ 
            error: `Maximum discount (₹${maxDiscount}) cannot be greater than the calculated discount (₹${calculatedMaxDiscount}) based on minimum purchase (₹${minPurchase}) and discount percentage (${discountAmount}%)` 
          });
        }
      }
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ 
      code: code.toUpperCase(), 
      isDeleted: false 
    });
    if (existingCoupon) {
      return res.status(400).json({ 
        error: `Coupon code "${code.toUpperCase()}" already exists. Please use a different code or update the existing coupon.` 
      });
    }

    // Create coupon
    const coupon = new Coupon({
      code: code.toUpperCase(),
      description,
      discountType,
      discountAmount: Number(discountAmount),
      minPurchase: minPurchase ? Number(minPurchase) : undefined,
      maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
      validFrom: validFromDate,
      validUntil: validUntilDate,
      usageLimit: Number(usageLimit),
      isActive: true
    });

    try {
      await coupon.save();
      res.status(201).json({ 
        success: true, 
        message: 'Coupon created successfully',
        coupon 
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ 
          error: `Coupon code "${code.toUpperCase()}" already exists. Please use a different code or update the existing coupon.` 
        });
      }
      console.error('Error creating coupon:', error);
      res.status(500).json({ error: 'Failed to create coupon' });
    }
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    await Coupon.findByIdAndUpdate(couponId, { 
      isDeleted: true,
      deletedAt: new Date()
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
};

exports.restoreCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    await Coupon.findByIdAndUpdate(couponId, { 
      isDeleted: false,
      deletedAt: null
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Restore coupon error:', error);
    res.status(500).json({ error: 'Failed to restore coupon' });
  }
};

exports.getArchivedCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({ isDeleted: true })
      .sort({ deletedAt: -1 });
    res.render('admin/archivedCoupons', { coupons });
  } catch (error) {
    console.error('Get archived coupons error:', error);
    res.status(500).render('error', { error: 'Failed to load archived coupons' });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const {
      code,
      description,
      discountType,
      discountAmount,
      minPurchase,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit
    } = req.body;

    // Validate required fields
    if (!code || !discountType || !discountAmount || !validFrom || !validUntil || !usageLimit) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Validate coupon code format
    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      return res.status(400).json({ error: 'Coupon code must be 4-10 characters long and contain only uppercase letters and numbers' });
    }

    // Validate dates
    const validFromDate = new Date(validFrom);
    const validUntilDate = new Date(validUntil);
    
    // Set both dates to start of day for proper comparison
    validFromDate.setHours(0, 0, 0, 0);
    validUntilDate.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (validUntilDate <= validFromDate) {
      return res.status(400).json({ error: 'Valid until date must be after valid from date' });
    }

    // Validate date ranges
    if (validFromDate.getTime() < today.getTime()) {
      return res.status(400).json({ error: 'Valid from date cannot be before today' });
    }

    const maxValidUntil = new Date();
    maxValidUntil.setFullYear(maxValidUntil.getFullYear() + 1);
    maxValidUntil.setHours(0, 0, 0, 0);
    if (validUntilDate > maxValidUntil) {
      return res.status(400).json({ error: 'Coupon validity cannot exceed 1 year' });
    }

    // Validate discount amount
    if (discountType === 'percentage' && (discountAmount <= 0 || discountAmount > 100)) {
      return res.status(400).json({ error: 'Percentage discount must be between 0 and 100' });
    }
    if (discountType === 'fixed' && discountAmount <= 0) {
      return res.status(400).json({ error: 'Fixed discount amount must be greater than 0' });
    }

    // Validate minimum purchase
    if (minPurchase && minPurchase < 0) {
      return res.status(400).json({ error: 'Minimum purchase amount cannot be negative' });
    }

    // Validate maximum discount
    if (maxDiscount && maxDiscount < 0) {
      return res.status(400).json({ error: 'Maximum discount amount cannot be negative' });
    }

    // Validate minimum purchase vs maximum discount
    if (maxDiscount && minPurchase && maxDiscount > minPurchase) {
      return res.status(400).json({ error: 'Maximum discount cannot be greater than minimum purchase amount' });
    }

    // Validate usage limit
    if (usageLimit < 1) {
      return res.status(400).json({ error: 'Usage limit must be at least 1' });
    }
    if (usageLimit > 100) {
      return res.status(400).json({ error: 'Usage limit cannot exceed 100 per user' });
    }

    // Enhanced discount validations
    if (discountType === 'fixed') {
      // For fixed amount discounts
      if (minPurchase && discountAmount > minPurchase) {
        return res.status(400).json({ error: 'Discount amount cannot be greater than minimum purchase amount' });
      }
      
      if (maxDiscount) {
        if (maxDiscount > minPurchase) {
          return res.status(400).json({ error: 'Maximum discount cannot be greater than minimum purchase amount' });
        }
        if (discountAmount > maxDiscount) {
          return res.status(400).json({ error: 'Discount amount cannot be greater than maximum discount' });
        }
      }
    } else if (discountType === 'percentage') {
      // For percentage discounts
      if (minPurchase && maxDiscount) {
        const calculatedMaxDiscount = (minPurchase * discountAmount) / 100;
        if (maxDiscount > calculatedMaxDiscount) {
          return res.status(400).json({ 
            error: `Maximum discount (₹${maxDiscount}) cannot be greater than the calculated discount (₹${calculatedMaxDiscount}) based on minimum purchase (₹${minPurchase}) and discount percentage (${discountAmount}%)` 
          });
        }
      }
    }

    // Check if coupon code already exists for another coupon
    const existingCoupon = await Coupon.findOne({
      code: code.toUpperCase(),
      _id: { $ne: couponId },
      isDeleted: false
    });
    if (existingCoupon) {
      return res.status(400).json({ error: 'Coupon code already exists' });
    }

    // Convert numeric values
    const updateData = {
      code: code.toUpperCase(),
      description,
      discountType,
      discountAmount: parseFloat(discountAmount),
      validFrom: validFromDate,
      validUntil: validUntilDate,
      usageLimit: parseInt(usageLimit)
    };

    // Only include optional fields if they are provided
    if (minPurchase) updateData.minPurchase = parseFloat(minPurchase);
    if (maxDiscount) updateData.maxDiscount = parseFloat(maxDiscount);

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      updateData,
      { new: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    res.json({ 
      success: true, 
      message: 'Coupon updated successfully',
      coupon: updatedCoupon 
    });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
}; 