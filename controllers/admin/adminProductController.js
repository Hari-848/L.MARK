const adminAuthenticated = require('../../middleware/adminauthMiddleware');
require('dotenv').config();
const Product = require('../../Models/productSchema');
const Variant = require('../../Models/variantSchema');
const Category = require('../../Models/categoryModel');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const fs = require('fs');
const mongoose = require('mongoose');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Add this new middleware specifically for adding new images
const addImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
}).array('imageFiles', 4);

exports.getProducts = [
  adminAuthenticated,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;
      const searchTerm = req.query.search;

      // Build search query
      let query = {};
      if (searchTerm) {
        query = {
          $or: [
            { productName: { $regex: searchTerm, $options: 'i' } },
            { description: { $regex: searchTerm, $options: 'i' } },
          ],
        };
      }

      const products = await Product.find(query)
        .populate('variants')
        .populate({
          path: 'categoriesId',
          select: 'categoriesName',
        })
        .skip(skip)
        .limit(limit)
        .lean();

      // Calculate total stock for each product from variants
      const productsWithStock = products.map(product => {
        const totalStock =
          product.variants?.reduce(
            (sum, variant) => sum + (variant.stock || 0),
            0
          ) || 0;

        return {
          ...product,
          totalStock,
          categoryName: product.categoriesId?.categoriesName || 'Uncategorized',
          displayPrice: product.variants?.[0]?.price
            ? `₹${product.variants[0].price}`
            : 'N/A',
        };
      });

      // Count total products for pagination
      const totalProducts = await Product.countDocuments(query);
      const totalPages = Math.ceil(totalProducts / limit);

      res.render('admin/adminProduct', {
        message: req.query.message || undefined,
        products: productsWithStock,
        currentPage: page,
        totalPages,
        searchTerm, // Pass search term to view
      });
    } catch (err) {
      console.error('Error in getProducts:', err);
      res.status(500).send('Error fetching products: ' + err.message);
    }
  },
];

exports.getAddProduct = [
  adminAuthenticated,
  async (req, res) => {
    try {
      const categories = await Category.find();
      res.render('admin/adminAddProduct', {
        pageTitle: 'Add Product',
        path: '/admin/products/add',
        categories: categories,
      });
    } catch (err) {
      console.error('Error fetching categories:', err);
      res.status(500).send('Error fetching categories');
    }
  },
];

exports.postAddProduct = async (req, res) => {
  try {
    let {
      productName,
      description,
      regularPrice,
      salePrice,
      category, // This will be the category name
    } = req.body;

    console.log('Received category name:', category); // Debug log

    // Validate required fields
    if (
      !productName ||
      !description ||
      !regularPrice ||
      !salePrice ||
      !category
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find category by name
    const categoryDoc = await Category.findOne({ name: category });
    if (!categoryDoc) {
      return res.status(400).json({ error: 'Category not found' });
    }

    regularPrice = Number(regularPrice);
    salePrice = Number(salePrice);

    // Handle image uploads
    let imageUrls = [];

    if (req.files && req.files.length > 0) {
      try {
        // Upload each image buffer to Cloudinary
        for (const file of req.files) {
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = 'data:' + file.mimetype + ';base64,' + b64;

          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'products',
            resource_type: 'auto',
          });

          console.log('Upload Success:', result);
          imageUrls.push(result.secure_url);
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        throw new Error('Failed to upload images: ' + uploadError.message);
      }
    }

    // Create new product with both category ID and name
    const newProduct = new Product({
      productName,
      description,
      regularPrice,
      salePrice,
      categoriesId: categoryDoc._id, // Save the category ID
      category: category, // Save the category name as well
      imageUrl: imageUrls,
      status: 'Available',
      variants: [],
    });

    console.log('Saving product:', {
      productName,
      category,
      categoryId: categoryDoc._id,
    }); // Debug log

    const savedProduct = await newProduct.save();

    res.status(200).json({
      message: 'Product added successfully',
      productId: savedProduct._id,
    });
  } catch (err) {
    console.error('Error adding product:', err);
    res.status(500).json({
      error: 'Error adding product: ' + (err.message || 'Unknown error'),
    });
  }
};

//---------------GET Update Product----------------------
exports.getProductDetails = [
  adminAuthenticated,
  async (req, res) => {
    try {
      const productId = req.params.id;
      const product = await Product.findById(productId)
        .populate('categoriesId') // Populate the category reference
        .populate('variants'); // Populate variants

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Fetch all categories
      const categories = await Category.find();

      const responseData = {
        product: {
          _id: product._id,
          productName: product.productName,
          description: product.description,
          type: product.type,
          regularPrice: product.regularPrice,
          salePrice: product.salePrice,
          photos: product.imageUrl || [], // Match with schema field name
          category: product.category,
          categoriesId: product.categoriesId?._id, // Include the category ID
        },
        variants: product.variants.map(variant => ({
          _id: variant._id,
          price: variant.price,
          stock: variant.stock,
          discountPrice: variant.discountPrice,
          discountPercentage: variant.discountPercentage,
        })),
        categories: categories.map(category => ({
          _id: category._id,
          name: category.name, // Match with categoryModel field name
        })),
      };

      res.status(200).json(responseData);
    } catch (error) {
      console.error('Error fetching product details:', error);
      res.status(500).json({ error: 'Failed to fetch product details' });
    }
  },
];

//---------------GET Update Product Image----------------------
exports.getEditProductImage = [
  adminAuthenticated,
  async (req, res) => {
    try {
      const productId = req.params.id;

      const product = await Product.findById(productId);
      if (!product) {
        console.log('Product not found');
        return res.status(404).json({ error: 'Product not found' });
      }

      //console.log(product);
      res.render('admin/adminEditImage', product);
    } catch (error) {
      console.error('Error fetching product details:', error);
      res.status(500).json({ error: 'Failed to fetch product details' });
    }
  },
];

//---------------POST Update Product Image----------------------

exports.postEditProductImage = async (req, res) => {
  try {
    const productId = req.params.id;
    const imageIndex = parseInt(req.body.imageIndex);

    // Find the product first
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Initialize productImage array if it doesn't exist
    if (!Array.isArray(product.productImage)) {
      product.productImage = [];
    }

    // Handle the uploaded file
    if (!req.file) {
      // Check for single file upload
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'product_variants',
    });

    // Update the image URL in the array
    if (imageIndex >= 0 && imageIndex < 4) {
      // Limit to 4 images
      // Ensure array has enough elements
      while (product.productImage.length <= imageIndex) {
        product.productImage.push('');
      }
      product.productImage[imageIndex] = result.url;
    }

    // Save the updated product
    await product.save();

    // Return success response
    res.status(200).json({
      success: true,
      newImageUrl: result.url,
      message: 'Image updated successfully',
    });
  } catch (error) {
    console.error('Comprehensive Error in Image Update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product image',
    });
  } finally {
    // Clean up uploaded files
    if (req.file) {
      // Check if req.file is defined
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting temporary file:', err);
      });
    }
  }
};

// Utility function to extract public ID from Cloudinary URL
function extractPublicIdFromUrl(url) {
  // Extract the public ID from a Cloudinary URL
  // Assumes Cloudinary URL format: https://res.cloudinary.com/[cloud_name]/image/upload/v[version]/[folder]/[public_id].[format]
  const matches = url.match(/\/v\d+\/([^/]+)\.[^/.]+$/);
  return matches ? matches[1] : null;
}

//---------------POST Update Product----------------------
exports.updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const updateData = req.body;

    console.log('Received update data:', updateData);

    // Find the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Validate required fields
    if (!updateData.productName?.trim() || !updateData.category?.trim()) {
      return res
        .status(400)
        .json({ error: 'Product name and category are required' });
    }

    // Update basic product fields
    product.productName = updateData.productName.trim();
    product.type = updateData.type;
    product.category = updateData.category.trim();
    if (updateData.categoriesId) {
      product.categoriesId = updateData.categoriesId;
    }

    // Update variants if provided
    if (updateData.variants && Array.isArray(updateData.variants)) {
      for (const variantData of updateData.variants) {
        if (variantData._id) {
          // Update existing variant
          await Variant.findByIdAndUpdate(
            variantData._id,
            {
              price: Number(variantData.price),
              stock: Number(variantData.stock),
              discountPrice: Number(variantData.discountPrice),
              discountPercentage: Number(variantData.discountPercentage),
            },
            { new: true }
          );
        }
      }
    }

    await product.save();

    res.json({
      success: true,
      message: 'Product and variants updated successfully',
      product: product,
    });
  } catch (error) {
    console.error('Error in updateProduct:', error);
    res.status(500).json({
      error: error.message || 'Failed to update product',
    });
  }
};

// Export the upload middleware for use in other routes
exports.upload = upload;

//              DELETE PRODUCT

exports.deleteProduct = async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);

    if (deletedProduct) {
      await Variant.deleteMany({ productId: req.params.id });
    }

    res.redirect(
      '/admin/products?message=Product%20and%20its%20variants%20deleted%20successfully'
    );
  } catch (err) {
    console.error('Error deleting product and its variants:', err);
    res.status(500).send('Error deleting product and its variants');
  }
};
//                VARIANTS

exports.getAddvariant = async (req, res) => {
  const { productId } = req.query;
  if (!productId) {
    return res.status(400).send('Product ID is required');
  }

  try {
    res.render('admin/adminAddvariant', {
      pageTitle: 'Add Variant',
      path: '/admin/products/add/variant',
      productId,
    });
  } catch (err) {
    console.error('Error rendering add variant form:', err);
    res.status(500).send('Error rendering add variant form');
  }
};

exports.postAddvariant = [
  adminAuthenticated,
  async (req, res) => {
    try {
      const {
        productId,
        type,
        stock,
        price,
        discountPrice,
        discountPercentage,
        rating,
      } = req.body;

      // Validate required fields
      if (!productId || !type || !stock || !price) {
        throw new Error('Missing required fields');
      }

      // Add this validation before creating new variant
      if (!['ruled', 'unruled'].includes(type.toLowerCase())) {
        throw new Error(
          'Invalid variant type. Must be either "Ruled" or "Unruled"'
        );
      }

      // Create new variant using the Variant model
      const newVariant = new Variant({
        productId: productId,
        variantType: type.charAt(0).toUpperCase() + type.slice(1), // Capitalize first letter to match enum
        price: parseFloat(price),
        discountPrice: parseFloat(discountPrice) || 0,
        discountPercentage: parseFloat(discountPercentage) || 0,
        stock: parseInt(stock),
        rating: parseFloat(rating) || 0, // Add rating field
      });

      // Save the variant
      await newVariant.save();

      // Update the product's reference to this variant
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        {
          $push: { variants: newVariant._id },
          // Update product's rating if needed
          $set: { rating: parseFloat(rating) || 0 },
        },
        { new: true }
      );

      // Redirect to products page after successful variant addition
      return res.redirect('/admin/products?message=Variant added successfully');
    } catch (err) {
      console.error('Error adding variant:', err);
      // If there's an error, render the form again with the error message
      return res.render('admin/adminAddvariant', {
        pageTitle: 'Add Variant',
        path: '/admin/products/add/variant',
        productId: req.body.productId,
        error: err.message,
      });
    }
  },
];

exports.addNewImages = [
  adminAuthenticated,
  (req, res, next) => {
    addImagesUpload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(500).json({ error: 'Error uploading files' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const productId = req.body.productId;
      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No image files uploaded' });
      }

      const currentImageCount = product.imageUrl.length;
      const maxImages = 4;
      const remainingSlots = maxImages - currentImageCount;

      if (req.files.length > remainingSlots) {
        return res.status(400).json({
          error: `Can only add ${remainingSlots} more images`,
        });
      }

      const uploadPromises = req.files.map(file => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'products' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result.secure_url);
            }
          );
          stream.end(file.buffer);
        });
      });

      const newImageUrls = await Promise.all(uploadPromises);
      product.imageUrl = [...product.imageUrl, ...newImageUrls];
      await product.save();

      res.json({
        success: true,
        message: 'Images added successfully',
        newImageUrls,
      });
    } catch (error) {
      console.error('Error adding new images:', error);
      res.status(500).json({
        error: error.message || 'Failed to add new images',
      });
    }
  },
];

exports.getEditImages = [
  adminAuthenticated,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).send('Product not found');
      }
      res.render('admin/adminEditImage', {
        productName: product.productName,
        imageUrl: product.imageUrl,
        _id: product._id,
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).send('Server error');
    }
  },
];

exports.updateProductImage = [
  adminAuthenticated,
  upload.single('imageFiles'),
  async (req, res) => {
    try {
      const productId = req.params.id;
      const imageIndex = parseInt(req.body.imageIndex);

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
      }

      // Upload to Cloudinary
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'products' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      // Update the specific image URL in the array
      if (imageIndex >= 0 && imageIndex < product.imageUrl.length) {
        product.imageUrl[imageIndex] = result.secure_url;
        await product.save();

        res.json({
          success: true,
          newImageUrl: result.secure_url,
          message: 'Image updated successfully',
        });
      } else {
        res.status(400).json({
          error: 'Invalid image index',
        });
      }
    } catch (error) {
      console.error('Error updating image:', error);
      res.status(500).json({
        error: error.message || 'Failed to update image',
      });
    }
  },
];
