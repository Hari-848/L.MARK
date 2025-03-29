const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['marvel', 'anime', 'sports'],
      set: v => v.toLowerCase(),  // Convert to lowercase before saving
      get: v => v.charAt(0).toUpperCase() + v.slice(1)  // Capitalize first letter when retrieving
    },
    variants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Variant',
      },
    ],
    regularPrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    productOffer: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },
    imageUrl: {
      type: [String],
      required: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Available', 'Out of Stock', 'Discontinued'],
      required: true,
      default: 'Available',
    },
    categoriesId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
