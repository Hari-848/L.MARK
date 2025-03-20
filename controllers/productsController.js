exports.searchAndFilterProducts = async (req, res) => {
  try {
    let { query, type, minPrice, maxPrice, category, stockStatus, sort } =
      req.query;

    // Initialize match criteria
    const matchCriteria = {};

    // Only add search criteria if query is provided
    if (query) {
      const searchRegex = new RegExp(query, 'i');
      matchCriteria.$or = [
        { productName: searchRegex },
        // Add other search fields if needed
      ];
    }

    // ... rest of your filtering logic ...

    const products = await Product.aggregate([
      // ... your existing aggregation pipeline ...
    ]);

    res.status(200).json({ products: products });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
};
