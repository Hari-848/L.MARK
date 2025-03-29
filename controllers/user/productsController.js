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
    
    // Fetch categories
    const categories = await Category.find({}, '_id name').lean();

    // Fetch products with variants using aggregation
    const products = await Product.aggregate([
      {
        $match: {
          isDeleted: { $ne: true }  // Add this to filter out deleted products
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

    console.log('Sample product:', products[0]); // Debug log

    const formattedProducts = products.map(product => ({
      _id: product._id,
      productName: product.productName,
      imageUrl:
        Array.isArray(product.imageUrl) && product.imageUrl.length > 0
          ? product.imageUrl[0]
          : '/images/default-product.jpg',
      variants: product.variants || [],
    }));

    // Debug log
    console.log('Sample formatted product:', formattedProducts[0]);

    res.render('user/products', {
      categories: categories,
      products: formattedProducts,
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
    const limit = parseInt(req.query.limit) || 9; // 9 products per page
    const skip = (page - 1) * limit;
    
    // Authentication check
    if (!req.session.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Set cache control headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    console.log('Received query params:', req.query);
    let { query, type, minPrice, maxPrice, category, stockStatus, sort } =
      req.query;

    // Initialize match criteria
    const matchCriteria = { isDeleted: { $ne: true } };

    // Text-based search
    if (query && query.trim()) {
      matchCriteria.productName = new RegExp(query.trim(), 'i');
    }

    // Type filter (ruled/unruled)
    if (type) {
      matchCriteria['variants.variantType'] = new RegExp(`^${type}$`, 'i');
    }

    // Price filter
    if (minPrice || maxPrice) {
      matchCriteria['variants.discountPrice'] = {};
      if (minPrice) {
        matchCriteria['variants.discountPrice'].$gte = Number(minPrice);
      }
      if (maxPrice) {
        matchCriteria['variants.discountPrice'].$lte = Number(maxPrice);
      }
    }

    // Category filter - Modified to handle both ID and name
    if (category && category !== 'all') {
      try {
        let categoryDoc;
        if (mongoose.Types.ObjectId.isValid(category)) {
          // First try to find category by ID
          categoryDoc = await Category.findById(category);
        }

        if (!categoryDoc) {
          // If not found by ID, try to find by name
          categoryDoc = await Category.findOne({
            name: { $regex: new RegExp(`^${category}$`, 'i') },
          });
        }

        if (categoryDoc) {
          matchCriteria.categoriesId = categoryDoc._id;
        } else {
          // Fallback to direct category name match
          matchCriteria.category = { $regex: new RegExp(`^${category}$`, 'i') };
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

    console.log('Final match criteria:', matchCriteria);

    // First, let's check what's in the products collection
    const sampleProduct = await Product.findOne();
    console.log('Sample product from DB:', sampleProduct);

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
      {
        $match: matchCriteria,
      },
      ...(sort
        ? [
            {
              $sort: (() => {
                switch (sort) {
                  case 'priceLowToHigh':
                    return { 'variants.discountPrice': 1 };
                  case 'priceHighToLow':
                    return { 'variants.discountPrice': -1 };
                  case 'newArrivals':
                    return { createdAt: -1 };
                  default:
                    return { 'variants.discountPrice': 1 };
                }
              })(),
            },
          ]
        : []),
      {
        $group: {
          _id: '$_id',
          productName: { $first: '$productName' },
          imageUrl: { $first: '$imageUrl' },
          categoriesId: { $first: '$categoriesId' },
          category: { $first: '$category' }, // Include category name
          variants: {
            $push: {
              _id: '$variants._id',
              variantType: '$variants.variantType',
              price: '$variants.price',
              rating: '$variants.rating',
              discountPrice: '$variants.discountPrice',
              stock: '$variants.stock',
            },
          },
        },
      },
    ];

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
      {
        $match: matchCriteria,
      },
      {
        $group: {
          _id: '$_id',
        },
      },
      {
        $count: 'total'
      }
    ];

    const totalProductsResult = await Product.aggregate(countPipeline);
    const totalProducts = totalProductsResult.length > 0 ? totalProductsResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / limit);
    
    // Debug your pagination
    console.log("Pagination parameters:", {
        page,
        limit,
        skip,
        totalProducts,
        totalPages
    });

    const products = await Product.aggregate(pipeline)
      .skip(skip)
      .limit(limit);

    console.log(`Found ${products.length} products matching criteria`);
    if (products.length > 0) {
      console.log('Sample matched product:', {
        id: products[0]._id,
        name: products[0].productName,
        categoryId: products[0].categoriesId,
        category: products[0].category,
      });
    }

    const formattedProducts = products.map(product => ({
      _id: product._id,
      productName: product.productName,
      imageUrl:
        Array.isArray(product.imageUrl) && product.imageUrl.length > 0
          ? product.imageUrl[0]
          : '/images/default-product.jpg',
      categoryId: product.categoriesId,
      category: product.category,
      variants: product.variants.filter(v => v._id),
    }));

    res.status(200).json({
      products: formattedProducts,
      totalPages: totalPages,
      currentPage: page
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
};

exports.viewProduct = async (req, res) => {
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

    const productId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).send('Invalid Product ID');
    }

    const offers = await Offer.find({ isActive: true });
    
    // Fetch product with its variants - add isDeleted check
    const product = await Product.aggregate([
      { $match: { 
          _id: new mongoose.Types.ObjectId(productId),
          isDeleted: { $ne: true }  // Add this line to filter out deleted products
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
          'variants.discountPrice': 1,
          'variants.discountPercentage': 1,
          'variants.rating': 1,
          'variants.variantType': 1,
          'variants.stock': 1,
        },
      },
    ]);

    if (!product || product.length === 0) {
      return res.status(404).send('Product not found');
    }
    
    // Debug log to check variants
    console.log('Product variants for view:', product[0].variants.map(v => ({
      id: v._id,
      type: v.variantType,
      price: v.price,
      discountPrice: v.discountPrice
    })));
    
    // Make sure variants have proper IDs
    if (product[0].variants.length === 0) {
      console.error('No variants found for product:', productId);
    }

    // Format product data
    const formattedProduct = {
      _id: product[0]._id,
      productName: product[0].productName,
      imageUrl: product[0].imageUrl,
      description: product[0].description,
      categoriesId: product[0].categoriesId,
      variants: product[0].variants.map(variant => ({
        _id: variant._id, // Make sure this is correctly set
        price: variant.price || 'N/A',
        discountPrice: variant.discountPrice || 'N/A',
        discountPercentage: variant.discountPercentage || 'N/A',
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

    const bestOffer = [...categoryOffers, ...productOffers].reduce(
      (maxOffer, currentOffer) =>
        !maxOffer ||
        currentOffer.discountPercentage > maxOffer.discountPercentage
          ? currentOffer
          : maxOffer,
      null
    );

    // Fetch related products with proper variant data
    const products = await Product.aggregate([
      {
        $lookup: {
          from: 'variants',
          localField: '_id',
          foreignField: 'productId',
          as: 'variants',
        },
      },
      {
        $match: {
          categoriesId: formattedProduct.categoriesId,
          _id: { $ne: new mongoose.Types.ObjectId(productId) },
          isDeleted: { $ne: true }  // Add this line to filter out deleted products
        },
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          imageUrl: 1,
          variants: {
            $map: {
              input: '$variants',
              as: 'variant',
              in: {
                _id: '$$variant._id',
                price: '$$variant.price',
                discountPrice: '$$variant.discountPrice',
              },
            },
          },
        },
      },
      { $limit: 4 },
    ]);

    console.log('Related products before formatting:', products); // Debug log

    const formattedRelatedProducts = products.map(product => ({
      _id: product._id,
      productName: product.productName,
      imageUrl:
        Array.isArray(product.imageUrl) && product.imageUrl.length > 0
          ? product.imageUrl[0]
          : '/images/default-product.jpg',
      variants: product.variants,
    }));

    console.log('Formatted related products:', formattedRelatedProducts); // Debug log

    res.render('user/viewProduct', {
      product: formattedProduct,
      relatedProducts: formattedRelatedProducts,
      offer: bestOffer,
    });
  } catch (err) {
    console.error('Error fetching product:', err.message);
    res.status(500).send('Server Error');
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
