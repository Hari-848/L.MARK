const adminAuthenticated = require('../../middleware/adminauthMiddleware');
const User = require('../../Models/userModel');

///////////////////Admin Login-------------------
exports.getLogin = (req, res) => {
  if (req.session.admin) {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.redirect('/admin/dashboard');
  } else {
    res.render('admin/adminLogin', { error: null });
  }
};

exports.postLogin = (req, res) => {
  res.clearCookie('connect.sid');
  if (
    process.env.ADMIN_EMAIL === req.body.email &&
    process.env.ADMIN_PASSWORD === req.body.password
  ) {
    req.session.admin = true;
    res.redirect('/admin/dashboard');
  } else {
    return res.render('admin/adminLogin', {
      error: 'Wrong Admin email or password',
    });
  }
};

///////////////////Admin Logout-------------------
exports.logout = (req, res) => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  req.session.destroy();
  res.redirect('/admin/login');
};

///////////////////Dashboard-------------------

exports.getDashboard = (req, res) => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  res.render('admin/adminDashboard');
};

///////////////////Dashboard Customers-------------------

exports.getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search;

    // Build search query
    let query = {};
    if (searchTerm) {
      query = {
        $or: [
          { fullName: { $regex: new RegExp(searchTerm, 'i') } },
          { email: { $regex: new RegExp(searchTerm, 'i') } },
        ],
      };
    }

    // Fetch customers with search query
    const customers = await User.find(query).skip(skip).limit(limit);

    // Get total count for pagination
    const totalCustomers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalCustomers / limit);

    res.render('admin/adminCustomers', {
      customers,
      currentPage: page,
      totalPages,
      searchTerm,
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).send('Error fetching customers');
  }
};

// Unblock a customer
exports.unblockCustomer = [
  async (req, res) => {
    try {
      const customerId = req.params.id;
      await User.findByIdAndUpdate(customerId, { status: 'active' });
      res.redirect('/admin/customers');
    } catch (err) {
      res.status(500).send('Error unblocking customer');
    }
  },
];

// Block a customer
exports.blockCustomer = [
  async (req, res) => {
    try {
      const customerId = req.params.id;
      await User.findByIdAndUpdate(customerId, { status: 'blocked' });
      res.redirect('/admin/customers');
    } catch (err) {
      res.status(500).send('Error blocking customer');
    }
  },
];

exports.updateStatus = [
  async (req, res) => {
    try {
      const customerId = req.params.id;
      const status = req.body.status;

      await User.findByIdAndUpdate(customerId, { status });

      res.json({ success: true });
    } catch (err) {
      res.json({ success: false, message: 'Error updating status' });
    }
  },
];

///////////////////Dashboard Category-------------------
const Category = require('../../Models/categoryModel');

exports.getCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search;

    // Build search query
    let query = {};
    if (searchTerm) {
      query = {
        name: { $regex: new RegExp(searchTerm, 'i') },
      };
    }

    // Fetch categories with search query
    const categories = await Category.find(query).skip(skip).limit(limit);

    // Get total count for pagination
    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render('admin/adminCategory', {
      message: req.query.message || undefined,
      categories,
      currentPage: page,
      totalPages,
      searchTerm,
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).send('Error fetching categories');
  }
};

exports.addCategory = async (req, res) => {
  try {
    const { categoriesName } = req.body;

    if (!categoriesName) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const trimmedName = categoriesName.trim();
    const lowerCategoryName = trimmedName.toLowerCase();
    const categoryName =
      lowerCategoryName.charAt(0).toUpperCase() + lowerCategoryName.slice(1);

    // Validate the category name
    if (!categoryName || categoryName.trim() === '') {
      return res.json({
        error: 'Category name cannot be empty or just spaces.',
      });
    }

    const containsAlphabets = /[a-zA-Z]/.test(categoryName);
    if (!containsAlphabets) {
      return res.json({
        error: 'Category name must include at least one alphabetic character.',
      });
    }

    // Check if the category already exists
    const existingCategory = await Category.findOne({
      name: categoryName,
    });
    if (existingCategory) {
      return res.json({
        error: 'Category already exists.',
      });
    }

    // Add the new category
    const newCategory = new Category({
      name: categoryName,
    });
    await newCategory.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).json({ error: 'Failed to add category' });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const lowerCategoryName = req.body.categoriesName.trim().toLowerCase();
    const categoriesName =
      lowerCategoryName.charAt(0).toUpperCase() + lowerCategoryName.slice(1);

    // Validate the category name
    if (!categoriesName || categoriesName.trim() === '') {
      return res.status(400).json({
        error: 'Category name cannot be empty or just spaces.'
      });
    }

    const containsAlphabets = /[a-zA-Z]/.test(categoriesName);
    if (!containsAlphabets) {
      return res.status(400).json({
        error: 'Category name must include at least one alphabetic character.'
      });
    }

    // Check if category name already exists (excluding current category)
    const existingCategory = await Category.findOne({
      name: categoriesName,
      _id: { $ne: req.params.id }
    });

    if (existingCategory) {
      return res.status(400).json({
        error: 'Category name already exists.'
      });
    }

    // Update the category
    await Category.findByIdAndUpdate(req.params.id, {
      name: categoriesName,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({
      error: 'Error updating category'
    });
  }
};

// Delete a category
exports.deleteCategory = async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.redirect('/admin/category');
  } catch (err) {
    res.status(500).send('Error deleting category');
  }
};
