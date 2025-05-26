const Cart = require('../../Models/cartModel');
const Product = require('../../Models/productSchema');
const Variant = require('../../Models/variantSchema');
const Wishlist = require('../../Models/wishlistSchema');
const Category = require('../../Models/categoryModel');
const Offer = require('../../Models/offerModel');

// Add to cart
exports.addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.session.user._id;

    // Find product and variant
    const product = await Product.findById(productId);
    const variant = await Variant.findById(variantId);

    if (!product || !variant) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found',
        updatedStock: 0
      });
    }

    // Check if variant belongs to the product
    if (variant.productId.toString() !== productId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid variant for this product',
        updatedStock: variant.stock
      });
    }

    // Check inventory
    if (variant.stock <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently out of stock',
        updatedStock: 0
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        totalAmount: 0
      });
    }

    // Check if this product variant is already in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId && 
             item.variantId.toString() === variantId
    );

    // Calculate total requested quantity
    const existingQuantity = existingItemIndex > -1 ? cart.items[existingItemIndex].quantity : 0;
    const totalRequestedQuantity = existingQuantity + quantity;

    // Check if total requested quantity exceeds stock
    if (totalRequestedQuantity > variant.stock) {
      // If the item is already in cart with full stock, remove it from wishlist and return success
      if (existingQuantity === variant.stock) {
        // Remove from wishlist if it exists there
        const wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
          const wishlistItemIndex = wishlist.products.findIndex(
            item => item.productId.toString() === productId
          );
          
          if (wishlistItemIndex !== -1) {
            wishlist.products.splice(wishlistItemIndex, 1);
            await wishlist.save();
          }
        }

        return res.status(200).json({
          success: true,
          message: 'Product is already in cart with full stock',
          cartCount: cart.items.reduce((total, item) => total + item.quantity, 0),
          removedFromWishlist: true
        });
      }

      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock - existingQuantity} item${variant.stock - existingQuantity === 1 ? '' : 's'} available in stock`,
        updatedStock: variant.stock
      });
    }

    // Get active offers for this product
    const currentDate = new Date();
    const activeOffers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      $or: [
        { offerType: 'Product', applicableProduct: productId },
        { offerType: 'Category', applicableCategory: product.categoriesId }
      ]
    });

    // Calculate price with any applicable offers
    let finalPrice = variant.price;
    let appliedOffer = null;

    if (activeOffers.length > 0) {
      // Find best offer (highest discount)
      const bestOffer = activeOffers.reduce(
        (best, current) =>
          current.discountPercentage > best.discountPercentage ? current : best,
        activeOffers[0]
      );

      // Calculate discounted price
      const discountAmount = (variant.price * bestOffer.discountPercentage) / 100;
      finalPrice = Math.round(variant.price - discountAmount);
      appliedOffer = {
        offerId: bestOffer._id,
        title: bestOffer.title,
        discountPercentage: bestOffer.discountPercentage
      };
    }

    // Remove from wishlist if it exists there
    let removedFromWishlist = false;
    const wishlist = await Wishlist.findOne({ userId });
    if (wishlist) {
      const wishlistItemIndex = wishlist.products.findIndex(
        item => item.productId.toString() === productId
      );
      
      if (wishlistItemIndex !== -1) {
        wishlist.products.splice(wishlistItemIndex, 1);
        await wishlist.save();
        removedFromWishlist = true;
      }
    }

    // Update or add item to cart
    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity = totalRequestedQuantity;
      cart.items[existingItemIndex].price = variant.price;
      cart.items[existingItemIndex].finalPrice = finalPrice;
      cart.items[existingItemIndex].offer = appliedOffer;
    } else {
      cart.items.push({
        productId,
        variantId,
        quantity,
        price: variant.price,
        finalPrice: finalPrice,
        offer: appliedOffer
      });
    }

    // Recalculate total
    cart.totalAmount = cart.items.reduce(
      (total, item) => total + (item.finalPrice * item.quantity),
      0
    );

    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.status(200).json({
      success: true,
      message: 'Product added to cart successfully',
      cartCount,
      removedFromWishlist,
      updatedStock: variant.stock // Send current stock without reducing it
    });

  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message,
      updatedStock: 0
    });
  }
};

// Get cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.session.user._id;
    console.log("Getting cart for user:", userId);
    
    // Find cart and populate product and variant details, excluding deleted categories
    const cart = await Cart.findOne({ userId })
    .populate({
      path: 'items.productId',
      match: { 
        'isDeleted': { $ne: true }, 
        'categoriesId': { 
          $in: await Category.find({ isDeleted: { $ne: true } }).distinct('_id') 
        }
      },
      select: 'productName imageUrl status'
    })
    .populate({
      path: 'items.variantId',
      select: 'variantType price discountPrice stock'
    });
    
    console.log("Cart found:", cart ? "Yes" : "No");
    if (cart) {
      console.log("Cart items:", cart.items.length);
    }
    
    // Filter out items where product is null (due to deleted categories)
    if (cart) {
      cart.items = cart.items.filter(item => item.productId != null);
      
      // Check and adjust quantities based on current stock
      let cartModified = false;
        for (const item of cart.items) {
          if (item.variantId && item.quantity > item.variantId.stock) {
            // If cart quantity exceeds stock, adjust it
            const oldQuantity = item.quantity;
            item.quantity = item.variantId.stock;
            cartModified = true;
            console.log(`Adjusted quantity for item ${item._id} from ${oldQuantity} to ${item.quantity} due to stock limit`);
          }
        }
      
      // Save cart if quantities were adjusted
      if (cartModified) {
        await cart.save();
      }
    }

    if (!cart) {
      return res.render('user/cart', { cart: { items: [] }, cartTotal: 0 });
    }

    // Calculate cart total
    const cartTotal = cart.items.reduce((total, item) => {
      return total + (item.finalPrice * item.quantity);
    }, 0);

    // Filter out any products that are no longer available
    const validItems = cart.items.filter(item => 
      item.productId && 
      (item.productId.status === 'Available' || item.productId.status === 'Listed') && 
      item.variantId && item.variantId.stock > 0
    );

    // If some items were filtered out, update the cart
    if (validItems.length !== cart.items.length) {
      cart.items = validItems;
      await cart.save();
    }

    res.render('user/cart', { cart, cartTotal });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).render('error', { error: 'Failed to load cart' });
  }
};

// Update cart item quantity
exports.updateCartItem = async (req, res) => {
  try {
    const { itemId, action } = req.body;
    const userId = req.session.user._id;
    
    // Find the cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }
    
    // Find the item in the cart
    const cartItem = cart.items.id(itemId);
    if (!cartItem) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }
    
    // Get current variant to check stock
    const variant = await Variant.findById(cartItem.variantId);
    if (!variant) {
      return res.status(404).json({ error: 'Product variant no longer available' });
    }
    
    // Update quantity based on action
    if (action === 'increment') {
      if (cartItem.quantity >= variant.stock) {
        return res.status(400).json({ error: 'Cannot add more of this item (stock limit reached)' });
      }
      cartItem.quantity += 1;
    } else if (action === 'decrement') {
      if (cartItem.quantity <= 1) {
        return res.status(400).json({ error: 'Quantity cannot be less than 1' });
      }
      cartItem.quantity -= 1;
    } else if (action === 'remove') {
      cart.items.pull(itemId);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    await cart.save();
    
    // Fetch the updated cart with populated variant information
    const updatedCart = await Cart.findOne({ userId })
      .populate({
        path: 'items.variantId',
        select: 'variantType price discountPrice stock'
      });
    
    // Find the updated item
    const updatedItem = updatedCart.items.id(itemId);
    
    // Calculate item total using finalPrice
    let itemTotal = 0;
    if (updatedItem) {
      itemTotal = updatedItem.finalPrice * updatedItem.quantity;
    }
    
    // Calculate new cart total using finalPrice
    const cartTotal = updatedCart.items.reduce((total, item) => {
      return total + (item.finalPrice * item.quantity);
    }, 0);
    
    res.json({ 
      success: true, 
      message: 'Cart updated successfully',
      cartTotal,
      itemTotal,
      cartCount: updatedCart.items.length
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Failed to update cart' });
  }
};

// Clear cart
exports.clearCart = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } },
      { new: true }
    );
    
    res.json({ success: true, message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
};

// Check if item is in cart
exports.checkItemInCart = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const userId = req.session.user._id;

    // Find cart
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.json({ isInCart: false });
    }

    // Check if item exists in cart
    const isInCart = cart.items.some(
      item => item.productId.toString() === productId && 
             item.variantId.toString() === variantId
    );

    res.json({ isInCart });
  } catch (error) {
    console.error('Error checking cart item:', error);
    res.status(500).json({ error: 'Failed to check cart item' });
  }
}; 