const Offer = require('../../Models/offerModel');

exports.getActiveOffers = async (req, res) => {
  try {
    const currentDate = new Date();
    
    // Get active offers that haven't expired
    const offers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    }).populate('applicableProduct', 'productName imageUrl')
      .populate('applicableCategory', 'name');

    // Format offers for display
    const formattedOffers = offers.map(offer => ({
      _id: offer._id,
      title: offer.title,
      discountPercentage: offer.discountPercentage,
      offerType: offer.offerType,
      applicableProduct: offer.applicableProduct ? {
        _id: offer.applicableProduct._id,
        name: offer.applicableProduct.productName,
        image: offer.applicableProduct.imageUrl?.[0] || '/images/default-product.jpg'
      } : null,
      applicableCategory: offer.applicableCategory ? {
        _id: offer.applicableCategory._id,
        name: offer.applicableCategory.name
      } : null,
      validUntil: offer.endDate
    }));

    res.render('user/offers', { offers: formattedOffers });
  } catch (error) {
    console.error('Error fetching active offers:', error);
    res.status(500).render('error', { error: 'Failed to fetch offers' });
  }
};
