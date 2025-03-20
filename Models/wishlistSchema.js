const mongoose = require('mongoose');
const { Schema } = mongoose;

const wishlistSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  products: [
    {
      productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
      },
      addedOn: {
        type: Date,
        default: Date.nowe,
      },
    },
  ],
});
const Wishlist = mongoose.model('Whishlist', wishlistSchema);
module.exports = Wishlist;
