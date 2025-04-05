const Offer = require('../../Models/offerModel');
const Product = require('../../Models/productSchema');
const Category = require('../../Models/categoryModel');

exports.getOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ isDeleted: false })
      .populate('applicableProduct', 'productName')
      .populate('applicableCategory', 'name')
      .sort({ createdAt: -1 });
      
    const products = await Product.find({ 
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } }
      ]
    }).select('_id productName').lean();
    
    const categories = await Category.find({})
      .select('_id name')
      .lean();
    
    // Format dates
    const formattedOffers = offers.map(offer => {
      const formattedOffer = offer.toObject();
      formattedOffer.startDate = new Date(formattedOffer.startDate);
      formattedOffer.endDate = new Date(formattedOffer.endDate);
      return formattedOffer;
    });
    
    res.render('admin/offers', { 
      offers: formattedOffers, 
      products, 
      categories
    });
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
};

exports.createOffer = async (req, res) => {
  try {
    const {
      title,
      discountPercentage,
      offerType,
      applicableProduct,
      applicableCategory,
      startDate,
      endDate
    } = req.body;

    // Validate required fields
    if (!title || !discountPercentage || !offerType || !startDate || !endDate) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Validate dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (endDateObj <= startDateObj) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // Validate discount percentage
    const discount = parseFloat(discountPercentage);
    if (isNaN(discount) || discount <= 0 || discount > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    // Validate offer type and applicable entity
    if (offerType === 'Product' && !applicableProduct) {
      return res.status(400).json({ error: 'Please select a product' });
    }
    if (offerType === 'Category' && !applicableCategory) {
      return res.status(400).json({ error: 'Please select a category' });
    }

    // Create offer
    const offer = new Offer({
      title,
      discountPercentage: discount,
      offerType,
      applicableProduct: offerType === 'Product' ? applicableProduct : undefined,
      applicableCategory: offerType === 'Category' ? applicableCategory : undefined,
      startDate: startDateObj,
      endDate: endDateObj,
      isActive: true,
      isDeleted: false
    });

    await offer.save();
    res.status(201).json({ 
      success: true, 
      message: 'Offer created successfully',
      offer 
    });
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
};

exports.updateOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const {
      title,
      discountPercentage,
      offerType,
      applicableProduct,
      applicableCategory,
      startDate,
      endDate
    } = req.body;

    // Validate required fields
    if (!title || !discountPercentage || !offerType || !startDate || !endDate) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Validate dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (endDateObj <= startDateObj) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // Validate discount percentage
    const discount = parseFloat(discountPercentage);
    if (isNaN(discount) || discount <= 0 || discount > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    // Validate offer type and applicable entity
    if (offerType === 'Product' && !applicableProduct) {
      return res.status(400).json({ error: 'Please select a product' });
    }
    if (offerType === 'Category' && !applicableCategory) {
      return res.status(400).json({ error: 'Please select a category' });
    }

    // Update offer
    const updateData = {
      title,
      discountPercentage: discount,
      offerType,
      applicableProduct: offerType === 'Product' ? applicableProduct : undefined,
      applicableCategory: offerType === 'Category' ? applicableCategory : undefined,
      startDate: startDateObj,
      endDate: endDateObj
    };

    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      updateData,
      { new: true }
    );

    if (!updatedOffer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    res.json({ 
      success: true, 
      message: 'Offer updated successfully',
      offer: updatedOffer 
    });
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({ error: 'Failed to update offer' });
  }
};

exports.deleteOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    
    const offer = await Offer.findByIdAndUpdate(
      offerId,
      { 
        isDeleted: true,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    res.json({ 
      success: true, 
      message: 'Offer deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
};

exports.restoreOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    
    const offer = await Offer.findByIdAndUpdate(
      offerId,
      { 
        isDeleted: false,
        deletedAt: null
      },
      { new: true }
    );

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    res.json({ 
      success: true, 
      message: 'Offer restored successfully' 
    });
  } catch (error) {
    console.error('Error restoring offer:', error);
    res.status(500).json({ error: 'Failed to restore offer' });
  }
};

exports.getArchivedOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ isDeleted: true })
      .populate('applicableProduct', 'productName')
      .populate('applicableCategory', 'name')
      .sort({ deletedAt: -1 });
    
    res.render('admin/archivedOffers', { offers });
  } catch (error) {
    console.error('Error fetching archived offers:', error);
    res.status(500).json({ error: 'Failed to fetch archived offers' });
  }
}; 