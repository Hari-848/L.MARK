const Wishlist = require('../../Models/wishlistSchema');
const Product = require('../../Models/productSchema');
const Variant = require('../../Models/variantSchema');

// Add to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const userId = req.session.user._id;
    
    // Validate product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Validate variant if provided
    if (variantId) {
      const variant = await Variant.findById(variantId);
      if (!variant) {
        return res.status(404).json({ error: 'Variant not found' });
      }
    }
    
    // Check if product is already in wishlist
    const existingWishlist = await Wishlist.findOne({ userId });
    
    if (existingWishlist) {
      // Check if this product is already in the wishlist
      const productExists = existingWishlist.products.some(
        item => item.productId.toString() === productId
      );
      
      if (productExists) {
        return res.status(200).json({ 
          success: true, 
          message: 'Product is already in your wishlist' 
        });
      }
      
      // Add product to existing wishlist
      existingWishlist.products.push({
        productId,
        addedOn: new Date()
      });
      
      await existingWishlist.save();
    } else {
      // Create new wishlist
      const newWishlist = new Wishlist({
        userId,
        products: [{
          productId,
          addedOn: new Date()
        }]
      });
      
      await newWishlist.save();
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Product added to wishlist successfully' 
    });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ error: 'Failed to add product to wishlist' });
  }
};

// Get wishlist
exports.getWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        select: 'productName imageUrl variants'
      });
    
    if (!wishlist) {
      return res.render('user/wishlist', { 
        wishlistItems: [],
        title: 'My Wishlist'
      });
    }
    
    // Get variant details for each product
    const wishlistItems = await Promise.all(
      wishlist.products.map(async (item) => {
        const product = item.productId;
        if (!product) return null; // Skip if product was deleted
        
        // Get variants for this product
        const variants = await Variant.find({ 
          productId: product._id 
        }).select('_id variantType price stock');
        
        return {
          _id: item._id,
          product: {
            _id: product._id,
            name: product.productName,
            image: product.imageUrl[0],
            variants
          },
          addedOn: item.addedOn
        };
      })
    );
    
    // Filter out null items (deleted products)
    const validItems = wishlistItems.filter(item => item !== null);
    
    res.render('user/wishlist', { 
      wishlistItems: validItems,
      title: 'My Wishlist'
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).render('error', { error: 'Failed to load wishlist' });
  }
};

// Remove from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.session.user._id;
    
    const result = await Wishlist.updateOne(
      { userId },
      { $pull: { products: { _id: itemId } } }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Item not found in wishlist' });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Item removed from wishlist' 
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Failed to remove item from wishlist' });
  }
};

// Clear wishlist
exports.clearWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    await Wishlist.findOneAndUpdate(
      { userId },
      { $set: { products: [] } }
    );
    
    res.status(200).json({ 
      success: true, 
      message: 'Wishlist cleared successfully' 
    });
  } catch (error) {
    console.error('Clear wishlist error:', error);
    res.status(500).json({ error: 'Failed to clear wishlist' });
  }
};

// Check if product is in wishlist
exports.checkWishlist = async (req, res) => {
  try {
    const { productId } = req.query;
    const userId = req.session.user._id;
    
    const wishlist = await Wishlist.findOne({ 
      userId,
      'products.productId': productId
    });
    
    res.status(200).json({ 
      inWishlist: !!wishlist
    });
  } catch (error) {
    console.error('Check wishlist error:', error);
    res.status(500).json({ error: 'Failed to check wishlist status' });
  }
};

// Remove product from wishlist
exports.removeProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user._id;
    
    const result = await Wishlist.updateOne(
      { userId },
      { $pull: { products: { productId: productId } } }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Product not found in wishlist' });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Product removed from wishlist successfully' 
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Failed to remove product from wishlist' });
  }
};

// Get all wishlist items
exports.getAllWishlistItems = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    const wishlist = await Wishlist.findOne({ userId }).populate('products.productId');
    
    if (!wishlist) {
      return res.status(200).json({ wishlistItems: [] });
    }
    
    res.status(200).json({ 
      wishlistItems: wishlist.products
    });
  } catch (error) {
    console.error('Get wishlist items error:', error);
    res.status(500).json({ error: 'Failed to get wishlist items' });
  }
}; 