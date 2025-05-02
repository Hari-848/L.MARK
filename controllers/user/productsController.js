const Product = require('../../Models/productSchema');
const Category = require('../../Models/categoryModel');
const Variant = require('../../Models/variantSchema');
const Offer = require('../../Models/offerModel');
const mongoose = require('mongoose'); // Import mongoose

exports.products = async (req, res) => {
  try {
    // Authentication check
    if (!req.session.user) {
      return res.redirect('/signin');
    }

    // Set cache control headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Fetch only non-deleted categories
    const categories = await Category.find({ isDeleted: { $ne: true } }, '_id name').lean();

    // Get array of active category IDs
    const activeCategoryIds = categories.map(cat => cat._id);

    // Get active offers
    const currentDate = new Date();
    const activeOffers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    }).populate('applicableProduct', 'productName imageUrl')
      .populate('applicableCategory', 'name');

    // Fetch products with variants using aggregation
    const products = await Product.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          categoriesId: { $in: activeCategoryIds }
        }
      },
      {
        $lookup: {
          from: 'variants',
          localField: '_id',
          foreignField: 'productId',
          as: 'variants',
        },
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          imageUrl: 1,
          categoriesId: 1,
          variants: {
            $map: {
              input: '$variants',
              as: 'variant',
              in: {
                _id: '$$variant._id',
                variantType: '$$variant.variantType',
                price: '$$variant.price',
                discountPrice: '$$variant.discountPrice',
                stock: '$$variant.stock',
              },
            },
          },
        },
      },
    ]);

    const formattedProducts = products.map(product => {
      const productObj = {
        _id: product._id,
        productName: product.productName,
        imageUrl:
          Array.isArray(product.imageUrl) && product.imageUrl.length > 0
            ? product.imageUrl[0]
            : '/images/default-product.jpg',
        categoriesId: product.categoriesId,
        variants: product.variants || [],
      };

      // Apply offers to products
      if (productObj.variants.length > 0) {
        // Find applicable offers for this product
        const productOffers = activeOffers.filter(
          offer => 
            offer.offerType === 'Product' && 
            offer.applicableProduct && 
            offer.applicableProduct._id.toString() === product._id.toString()
        );
        
        const categoryOffers = activeOffers.filter(
          offer => 
            offer.offerType === 'Category' && 
            offer.applicableCategory && 
            offer.applicableCategory._id.toString() === product.categoriesId.toString()
        );
        
        const applicableOffers = [...productOffers, ...categoryOffers];
        
        if (applicableOffers.length > 0) {
          // Sort offers by discount percentage (highest first)
          const sortedOffers = [...applicableOffers].sort((a, b) => 
            b.discountPercentage - a.discountPercentage
          );
          
          // Get the best offer (highest discount)
          const bestOffer = sortedOffers[0];
          
          // Get second best offer if available
          const secondaryOffer = sortedOffers.length > 1 ? sortedOffers[1] : null;
          
          // Apply offer to all variants
          productObj.variants = productObj.variants.map(variant => {
            const discountAmount = (variant.price * bestOffer.discountPercentage) / 100;
            
            // Debug log
            console.log(`Product: ${product.productName}, Primary offer: ${bestOffer.title}, Secondary offer: ${secondaryOffer ? secondaryOffer.title : 'None'}`);
            
            return {
              ...variant,
              discountPrice: Math.round(variant.price - discountAmount),
              offer: {
                id: bestOffer._id,
                discountPercentage: bestOffer.discountPercentage,
                title: bestOffer.title,
                offerType: bestOffer.offerType
              },
              // Include secondary offer if available
              secondaryOffer: secondaryOffer ? {
                id: secondaryOffer._id,
                discountPercentage: secondaryOffer.discountPercentage,
                title: secondaryOffer.title,
                offerType: secondaryOffer.offerType
              } : null,
              // Include all applicable offers for reference
              allOffers: sortedOffers.map(offer => ({
                id: offer._id,
                discountPercentage: offer.discountPercentage,
                title: offer.title,
                offerType: offer.offerType
              }))
            };
          });
        }
      }
      
      return productObj;
    });

    res.render('user/products', {
      categories: categories,
      products: formattedProducts,
      offers: activeOffers
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Server Error');
  }

};

exports.getFilterOptions = async (req, res) => {
  try {
    const types = ['ruled', 'unruled'];
    const categories = await Category.find({}, { _id: 1, categoriesName: 1 });

    res.status(200).json({
      types,
      categories,
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
};

exports.searchAndFilterProducts = async (req, res) => {
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6; 
    const skip = (page - 1) * limit;
    
    // Authentication check
    if (!req.session.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Update cache control headers to prevent stale offer data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Get query parameters
    let { query, type, minPrice, maxPrice, category, stockStatus, sort } = req.query;

    // Get active categories
    const activeCategories = await Category.find({ isDeleted: { $ne: true } }, '_id').lean();
    const activeCategoryIds = activeCategories.map(cat => cat._id);

    // Initialize match criteria with active categories
    const matchCriteria = { 
      isDeleted: { $ne: true },
      categoriesId: { $in: activeCategoryIds }
    };

    // Text-based search - Make case-insensitive
    if (query && query.trim()) {
      // Create an array of conditions to check multiple fields
      const searchRegex = new RegExp(query.trim(), 'i'); // 'i' flag makes it case-insensitive
      matchCriteria.$or = [
        { productName: searchRegex },
        { description: searchRegex },
        { 'variants.variantType': searchRegex }
      ];
    }

    // Type filter (ruled/unruled)
    if (type) {
      matchCriteria['variants.variantType'] = new RegExp(`^${type}$`, 'i');
    }

    // Price filter
    if (minPrice || maxPrice) {
      matchCriteria['variants.price'] = {};
      if (minPrice) {
        matchCriteria['variants.price'].$gte = Number(minPrice);
      }
      if (maxPrice) {
        matchCriteria['variants.price'].$lte = Number(maxPrice);
      }
    }

    // Category filter - Handle both ID and name
    if (category && category !== 'all') {
      try {
        let categoryDoc;
        if (mongoose.Types.ObjectId.isValid(category)) {
          // First try to find non-deleted category by ID
          categoryDoc = await Category.findOne({
            _id: category,
            isDeleted: { $ne: true }
          }).lean();
        }

        if (!categoryDoc) {
          // If not found by ID, try to find non-deleted category by name
          categoryDoc = await Category.findOne({
            name: { $regex: new RegExp(`^${category}$`, 'i') },
            isDeleted: { $ne: true }
          }).lean();
        }

        if (categoryDoc) {
          matchCriteria.categoriesId = categoryDoc._id;
        } else {
          // If category not found or is deleted, return no results
          return res.status(200).json({
            products: [],
            totalPages: 0,
            currentPage: page,
            message: 'No products found in this category'
          });
        }
      } catch (error) {
        console.error('Error processing category:', error);
      }
    }

    // Stock status filter
    if (stockStatus) {
      switch (stockStatus) {
        case 'inStock':
          matchCriteria['variants.stock'] = { $gt: 0 };
          break;
        case 'outOfStock':
          matchCriteria['variants.stock'] = { $lte: 0 };
          break;
      }
    }

    // Create sort object based on user selection
    let sortCriteria = {};
    if (sort) {
      switch (sort) {
        case 'priceLowToHigh':
          sortCriteria = { 'variants.price': 1 }; // Initial sort by base price
          break;
        case 'priceHighToLow':
          sortCriteria = { 'variants.price': -1 }; // Initial sort by base price
          break;
        case 'newArrivals':
          sortCriteria = { createdAt: -1 };
          break;
        case 'popularity':
          sortCriteria = { 'variants.rating': -1 };
          break;
        default:
          sortCriteria = { 'variants.price': 1 };
      }
    } else {
      sortCriteria = { 'variants.price': 1 };
    }

    // Aggregation pipeline for efficient querying
    const pipeline = [
      {
        $lookup: {
          from: 'variants',
          localField: '_id',
          foreignField: 'productId',
          as: 'variants',
        },
      },
      {
        $unwind: {
          path: '$variants',
          preserveNullAndEmptyArrays: false,
        },
      },
      { $match: matchCriteria },
      { $sort: sortCriteria },
      {
        $group: {
          _id: '$_id',
          productName: { $first: '$productName' },
          imageUrl: { $first: '$imageUrl' },
          description: { $first: '$description' },
          categoriesId: { $first: '$categoriesId' },
          createdAt: { $first: '$createdAt' },
          variants: {
            $push: {
              _id: '$variants._id',
              variantType: '$variants.variantType',
              price: '$variants.price',
              stock: '$variants.stock',
              rating: '$variants.rating',
            },
          },
        },
      }
    ];

    // Count pipeline for total number of results
    const countPipeline = [
      {
        $lookup: {
          from: 'variants',
          localField: '_id',
          foreignField: 'productId',
          as: 'variants',
        },
      },
      {
        $unwind: {
          path: '$variants',
          preserveNullAndEmptyArrays: false,
        },
      },
      { $match: matchCriteria },
      { $group: { _id: '$_id' } },
      { $count: 'total' }
    ];

    // Run both queries in parallel for better performance
    const [allProducts, totalProductsResult] = await Promise.all([
      Product.aggregate(pipeline).option({ maxTimeMS: 5000 }),
      Product.aggregate(countPipeline).option({ maxTimeMS: 5000 })
    ]);

    const totalProducts = totalProductsResult.length > 0 ? totalProductsResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / limit);

    // After retrieving all products, apply offers and sort by final price if needed
    const currentDate = new Date();
    const activeOffers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    }).lean();

    let productsWithOffers = allProducts.map(product => {
      // Process product image URL
      let processedImageUrl = '/images/default-product.jpg';
      if (product.imageUrl) {
        if (Array.isArray(product.imageUrl) && product.imageUrl.length > 0) {
          processedImageUrl = product.imageUrl[0];
        } else if (typeof product.imageUrl === 'string') {
          processedImageUrl = product.imageUrl;
        }
      }
      
      // Find applicable offers for this product
      const productOffers = activeOffers.filter(
        offer => 
          offer.offerType === 'Product' && 
          offer.applicableProduct && 
          offer.applicableProduct.toString() === product._id.toString()
      );
      
      const categoryOffers = activeOffers.filter(
        offer => 
          offer.offerType === 'Category' && 
          offer.applicableCategory && 
          offer.applicableCategory.toString() === product.categoriesId.toString()
      );
      
      const applicableOffers = [...productOffers, ...categoryOffers];
      
      if (applicableOffers.length > 0) {
        // Sort offers by discount percentage (highest first)
        const sortedOffers = [...applicableOffers].sort((a, b) => 
          b.discountPercentage - a.discountPercentage
        );
        
        // Get the best offer (highest discount)
        const bestOffer = sortedOffers[0];
        
        // Get second best offer if available
        const secondaryOffer = sortedOffers.length > 1 ? sortedOffers[1] : null;
        
        // Apply offer to all variants
        product.variants = product.variants.map(variant => {
          const discountAmount = (variant.price * bestOffer.discountPercentage) / 100;
          return {
            ...variant,
            discountPrice: Math.round(variant.price - discountAmount),
            offer: {
              id: bestOffer._id,
              discountPercentage: bestOffer.discountPercentage,
              title: bestOffer.title,
              offerType: bestOffer.offerType
            },
            secondaryOffer: secondaryOffer ? {
              id: secondaryOffer._id,
              discountPercentage: secondaryOffer.discountPercentage,
              title: secondaryOffer.title,
              offerType: secondaryOffer.offerType
            } : null
          };
        });
      }
      
      return {
        ...product,
        imageUrl: processedImageUrl
      };
    });

    // Sort all products by final price if price sorting is selected
    if (sort === 'priceLowToHigh' || sort === 'priceHighToLow') {
      productsWithOffers.sort((a, b) => {
        const priceA = a.variants[0]?.discountPrice || a.variants[0]?.price || 0;
        const priceB = b.variants[0]?.discountPrice || b.variants[0]?.price || 0;
        return sort === 'priceLowToHigh' ? priceA - priceB : priceB - priceA;
      });
    }

    // Apply pagination after sorting
    const paginatedProducts = productsWithOffers.slice(skip, skip + limit);

    // Return structured response
    res.status(200).json({
      products: paginatedProducts,
      totalPages: totalPages,
      currentPage: page,
      totalProducts: totalProducts,
      resultsPerPage: limit
    });
  } catch (error) {
    console.error('Error searching products:', error);
    
    // Better error handling with appropriate status code
    const statusCode = error.name === 'ValidationError' ? 400 : 500;
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Error: ${error.message}` 
      : 'Failed to search products';
      
    res.status(statusCode).json({ 
      error: errorMessage,
      success: false 
    });
  }
};

exports.viewProduct = async (req, res) => {
  try {
    // Authentication check
    if (!req.session.user) {
      return res.redirect('/signin');
    }

    // Set cache control headers - prevent caching to ensure fresh data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const productId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).send('Invalid Product ID');
    }

    // Get active offers with the same criteria as the products and searchAndFilterProducts functions
    const currentDate = new Date();
    const offers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    });

    // Fetch product with its variants
    const product = await Product.aggregate([
      { $match: { 
          _id: new mongoose.Types.ObjectId(productId),
          isDeleted: { $ne: true }
        } 
      },
      {
        $lookup: {
          from: 'variants',
          localField: '_id',
          foreignField: 'productId',
          as: 'variants',
        },
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          imageUrl: 1,
          categoriesId: 1,
          description: 1,
          'variants._id': 1,
          'variants.price': 1,
          'variants.rating': 1,
          'variants.variantType': 1,
          'variants.stock': 1,
        },
      },
    ]);

    if (!product || product.length === 0) {
      return res.status(404).send('Product not found');
    }
    
    // Format product data
    const formattedProduct = {
      _id: product[0]._id,
      productName: product[0].productName,
      imageUrl: product[0].imageUrl,
      description: product[0].description,
      categoriesId: product[0].categoriesId,
      variants: product[0].variants.map(variant => ({
        _id: variant._id,
        price: variant.price || 'N/A',
        rating: variant.rating || 'No rating',
        variantType: variant.variantType || 'Standard',
        stock: variant.stock,
      })),
    };

    // Calculate applicable offer
    const categoryOffers = offers.filter(
      offer =>
        offer.applicableCategory?.toString() ===
        formattedProduct.categoriesId?.toString()
    );

    const productOffers = offers.filter(
      offer =>
        offer.applicableProduct?.toString() === formattedProduct._id.toString()
    );

    // Sort all applicable offers by discount percentage
    const sortedOffers = [...categoryOffers, ...productOffers].sort(
      (a, b) => b.discountPercentage - a.discountPercentage
    );

    // Get the best offer (highest discount)
    const bestOffer = sortedOffers.length > 0 ? sortedOffers[0] : null;
    
    // Get second best offer if available
    const secondaryOffer = sortedOffers.length > 1 ? sortedOffers[1] : null;

    // Get related products
    const relatedProducts = await Product.find({
      categoriesId: formattedProduct.categoriesId,
      _id: { $ne: formattedProduct._id },
      isDeleted: { $ne: true }
    }).limit(4);

    // Format related products and apply offers
    const formattedRelatedProducts = await Promise.all(relatedProducts.map(async (relatedProduct) => {
      // Format the basic product info
      const formattedRelated = {
        _id: relatedProduct._id,
        productName: relatedProduct.productName,
        imageUrl: relatedProduct.imageUrl || ['/images/default-product.jpg'],
        categoriesId: relatedProduct.categoriesId,
      };

      // Get variants for this related product
      const variants = await Variant.find({ productId: relatedProduct._id }).lean();
      formattedRelated.variants = variants;

      // Apply offers to related product variants if applicable
      if (variants.length > 0) {
        // Find applicable offers for this related product
        const relProductOffers = offers.filter(
          offer => 
            offer.offerType === 'Product' && 
            offer.applicableProduct && 
            offer.applicableProduct.toString() === relatedProduct._id.toString()
        );
        
        const relCategoryOffers = offers.filter(
          offer => 
            offer.offerType === 'Category' && 
            offer.applicableCategory && 
            offer.applicableCategory.toString() === relatedProduct.categoriesId.toString()
        );
        
        const relApplicableOffers = [...relProductOffers, ...relCategoryOffers];
        
        if (relApplicableOffers.length > 0) {
          // Sort offers by discount percentage (highest first)
          const relSortedOffers = [...relApplicableOffers].sort((a, b) => 
            b.discountPercentage - a.discountPercentage
          );
          
          // Get the best offer and second best offer
          const relBestOffer = relSortedOffers[0];
          const relSecondaryOffer = relSortedOffers.length > 1 ? relSortedOffers[1] : null;
          
          // Apply offers to all variants
          formattedRelated.variants = formattedRelated.variants.map(variant => {
            const discountAmount = (variant.price * relBestOffer.discountPercentage) / 100;
            return {
              ...variant,
              discountPrice: Math.round(variant.price - discountAmount),
              offer: {
                id: relBestOffer._id,
                discountPercentage: relBestOffer.discountPercentage,
                title: relBestOffer.title,
                offerType: relBestOffer.offerType
              },
              secondaryOffer: relSecondaryOffer ? {
                id: relSecondaryOffer._id,
                discountPercentage: relSecondaryOffer.discountPercentage,
                title: relSecondaryOffer.title,
                offerType: relSecondaryOffer.offerType
              } : null
            };
          });
        }
      }

      return formattedRelated;
    }));

    res.render('user/viewProduct', {
      product: formattedProduct,
      relatedProducts: formattedRelatedProducts,
      offer: bestOffer,
      secondaryOffer: secondaryOffer
    });
  } catch (error) {
    console.error('Error viewing product:', error);
    res.status(500).send('Error viewing product');
  }
};

// Updated to handle variant types instead of colors
exports.getVariantDetails = async (req, res) => {
  try {
    const { productId, type } = req.query; // Changed from color to type

    // Validate inputs
    if (!productId || !type) {
      return res
        .status(400)
        .json({ message: 'Missing productId or variant type.' });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Invalid Product ID.' });
    }

    // Fetch the variant directly from the Variant collection
    const variant = await Variant.findOne({
      productId: productId,
      variantType: { $regex: new RegExp(`^${type}$`, 'i') }, // Changed from color to variantType
    });

    if (!variant) {
      return res.status(404).json({ message: 'Variant not found.' });
    }

    res.json(variant);
  } catch (error) {
    console.error('Error fetching variant details:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

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

    res.json(formattedOffers);
  } catch (error) {
    console.error('Error fetching active offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
};
