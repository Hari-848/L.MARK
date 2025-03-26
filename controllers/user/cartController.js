const Cart = require('../../Models/cartModel');
const Product = require('../../Models/productSchema');
const Variant = require('../../Models/variantSchema');
const Wishlist = require('../../Models/wishlistSchema');

// Add to cart
exports.addToCart = async (req, res) => {
  try {
    console.log('Add to cart request received with body:', JSON.stringify(req.body));
    console.log('Session data:', req.session);
    const { productId, variantId, quantity = 1 } = req.body;
    const userId = req.session.user._id;
    
    console.log('User ID:', userId);

    // Validate product and variant
    const product = await Product.findById(productId);
    if (!product) {
      console.log('Product not found:', productId);
      return res.status(404).json({ error: 'Product not found' });
    }
    console.log('Product found:', product.productName);

    // Check if product is blocked or unlisted
    if (product.status !== 'Available' && product.status !== 'Listed') {
      console.log('Product not available:', product.status);
      return res.status(400).json({ error: 'This product is currently unavailable' });
    }

    const variant = await Variant.findById(variantId);
    if (!variant) {
      console.log('Variant not found:', variantId);
      return res.status(404).json({ error: 'Variant not found' });
    }
    console.log('Variant found:', variant.variantType);

    // Check if variant belongs to the product
    console.log('Variant productId:', variant.productId.toString());
    console.log('Product ID:', productId);
    if (variant.productId.toString() !== productId) {
      return res.status(400).json({ error: 'Invalid variant for this product' });
    }

    // Check if variant is in stock
    if (variant.stock < 1) {
      return res.status(400).json({ error: 'Product is out of stock' });
    }

    // Check if requested quantity is available
    if (variant.stock < quantity) {
      return res.status(400).json({ error: `Only ${variant.stock} items available in stock` });
    }

    // Find user's cart or create a new one
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check if this product variant is already in the cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.variant.toString() === variantId
    );

    if (existingItemIndex > -1) {
      // Update quantity if product already exists in cart
      const newQuantity = cart.items[existingItemIndex].quantity + parseInt(quantity);
      
      // Validate against stock
      if (newQuantity > variant.stock) {
        return res.status(400).json({ 
          error: `Cannot add more. You already have ${cart.items[existingItemIndex].quantity} in your cart and only ${variant.stock} are available.` 
        });
      }
      
      // Update quantity
      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // Add new item to cart
      cart.items.push({
        product: productId,
        variant: variantId,
        quantity: parseInt(quantity),
        price: variant.price
      });
    }

    await cart.save();

    // Remove from wishlist if it exists there
    await Wishlist.updateOne(
      { userId },
      { $pull: { products: { productId: productId } } }
    );

    // At the end, log the response
    console.log('Cart updated successfully, items count:', cart.items.length);
    
    res.status(200).json({ 
      success: true, 
      message: 'Product added to cart successfully',
      cartCount: cart.items.length
    });
  } catch (error) {
    console.error('Add to cart error details:', error);
    res.status(500).json({ error: 'Failed to add product to cart', details: error.message });
  }
};

// Get cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.session.user._id;
    console.log("Getting cart for user:", userId);
    
    // Find cart and populate product and variant details
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.product',
        select: 'productName imageUrl status'
      })
      .populate({
        path: 'items.variant',
        select: 'variantType price discountPrice stock'
      });
    
    console.log("Cart found:", cart ? "Yes" : "No");
    if (cart) {
      console.log("Cart items:", cart.items.length);
    }
    
    if (!cart) {
      return res.render('user/cart', { cart: { items: [] }, cartTotal: 0 });
    }

    // Calculate cart total
    const cartTotal = cart.items.reduce((total, item) => {
      const itemPrice = (item.variant.discountPrice && item.variant.discountPrice > 0) 
        ? item.variant.discountPrice 
        : item.price;
      return total + (itemPrice * item.quantity);
    }, 0);

    // Filter out any products that are no longer available
    const validItems = cart.items.filter(item => 
      item.product && 
      (item.product.status === 'Available' || item.product.status === 'Listed') && 
      item.variant && item.variant.stock > 0
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
    const variant = await Variant.findById(cartItem.variant);
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
        path: 'items.variant',
        select: 'variantType price discountPrice stock'
      });
    
    // Find the updated item
    const updatedItem = updatedCart.items.id(itemId);
    
    // Calculate item total with proper discount
    let itemTotal = 0;
    if (updatedItem) {
      const itemPrice = (updatedItem.variant.discountPrice && updatedItem.variant.discountPrice > 0) 
        ? updatedItem.variant.discountPrice 
        : updatedItem.price;
      itemTotal = itemPrice * updatedItem.quantity;
    }
    
    // Calculate new cart total
    const cartTotal = updatedCart.items.reduce((total, item) => {
      const itemPrice = (item.variant.discountPrice && item.variant.discountPrice > 0) 
        ? item.variant.discountPrice 
        : item.price;
      return total + (itemPrice * item.quantity);
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