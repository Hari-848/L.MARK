const mongoose = require('mongoose');
const { Schema } = mongoose;

const variantSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variantType: {
      type: String,
      enum: ['Ruled', 'Unruled'], // Only allows these two options
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    stock: {
      type: Number,
      required: true,
      default: 0, // Default stock is 0
    },
  },
  { timestamps: true }
);

const Variant = mongoose.model('Variant', variantSchema);
module.exports = Variant;
