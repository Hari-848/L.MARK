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

exports. getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search;

    // Build search query
    let query = {};
    if (searchTerm) {
      // Escape special regex characters to treat them as literals
      const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      query = {
        $or: [
          { fullName: { $regex: new RegExp(escapedSearchTerm, 'i') } },
          { email: { $regex: new RegExp(escapedSearchTerm, 'i') } },
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
    res.status(500).render('partials/user/404', {
      isAdmin: true,
      error: 'Error fetching customers. Please try a different search term.'
    });
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

      const user = await User.findByIdAndUpdate(customerId, { status });

      // If user is being blocked, destroy their active sessions
      if (status === 'blocked') {
        // Get the session store
        const sessionStore = req.sessionStore;
        
        // Find and destroy all sessions for this user
        await new Promise((resolve, reject) => {
          sessionStore.all((err, sessions) => {
            if (err) {
              reject(err);
              return;
            }

            const promises = Object.entries(sessions || {}).map(([sid, session]) => {
              if (session?.user?._id?.toString() === customerId || 
                  session?.passport?.user === customerId) {
                return new Promise((r) => sessionStore.destroy(sid, r));
              }
            }).filter(Boolean);

            Promise.all(promises).then(resolve).catch(reject);
          });
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Error updating status:', err);
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
    
    console.log('Fetching non-deleted categories...');
    
    // Only show non-deleted categories
    const categories = await Category.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    console.log(`Found ${categories.length} non-deleted categories`);

    
    if (categories.length > 0) {
      console.log('Sample category:', {
        id: categories[0]._id,
        name: categories[0].name,
        isDeleted: categories[0].isDeleted
      });
    }
     
    
    const totalCategories = await Category.countDocuments({ isDeleted: { $ne: true } });
    const totalPages = Math.ceil(totalCategories / limit);
    
    res.render('admin/adminCategory', {
      categories,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).render('error', { error: 'Failed to load categories' });
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
    const categoriesName = lowerCategoryName.charAt(0).toUpperCase() + lowerCategoryName.slice(1);

    // Validate the category name
    if (!categoriesName || categoriesName.trim() === '') {
      return res.status(400).render('admin/adminCategory', {
        error: 'Category name cannot be empty or just spaces.',
        categories: await Category.find(),
        currentPage: 1,
        totalPages: Math.ceil((await Category.countDocuments()) / 10),
      });
    }

    const containsAlphabets = /[a-zA-Z]/.test(categoriesName);
    if (!containsAlphabets) {
      return res.status(400).render('admin/adminCategory', {
        error: 'Category name must include at least one alphabetic character.',
        categories: await Category.find(),
        currentPage: 1,
        totalPages: Math.ceil((await Category.countDocuments()) / 10),
      });
    }

    // Update the category
    await Category.findByIdAndUpdate(req.params.id, {
      name: categoriesName,
    });

    res.redirect('/admin/category');
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).send('Error updating category');
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

// Soft delete a category
exports.softDeleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    
    console.log(`Attempting to soft delete category with ID: ${categoryId}`);
    
    const category = await Category.findById(categoryId);
    
    if (!category) {
      console.error(`Category not found with ID: ${categoryId}`);
      return res.status(404).json({ error: 'Category not found' });
    }
    
    console.log(`Found category: ${category.name}, current isDeleted value: ${category.isDeleted}`);
    
    // Set isDeleted flag to true
    category.isDeleted = true;
    await category.save();
    
    console.log(`Category hidden successfully. New isDeleted value: ${category.isDeleted}`);
    
    res.status(200).json({ success: true, message: 'Category hidden successfully' });
  } catch (error) {
    console.error('Soft delete category error:', error);
    res.status(500).json({ error: 'Failed to hide category' });
  }
};

// Get archived categories
exports.getArchivedCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    console.log('Fetching archived categories...');
    
    // Only show deleted categories
    const categories = await Category.find({ isDeleted: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    console.log(`Found ${categories.length} archived categories`);
    
    const totalCategories = await Category.countDocuments({ isDeleted: true });
    const totalPages = Math.ceil(totalCategories / limit);
    
    res.render('admin/archivedCategories', {
      categories,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error('Get archived categories error:', error);
    res.status(500).render('error', { error: 'Failed to load archived categories' });
  }
};

// Restore a category
exports.restoreCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    
    console.log(`Attempting to restore category with ID: ${categoryId}`);
    
    const category = await Category.findById(categoryId);
    
    if (!category) {
      console.error(`Category not found with ID: ${categoryId}`);
      return res.status(404).json({ error: 'Category not found' });
    }
    
    console.log(`Found category: ${category.name}, current isDeleted value: ${category.isDeleted}`);
    
    // Set isDeleted flag to false
    category.isDeleted = false;
    await category.save();
     
    

    console.log(`Category restored successfully. New isDeleted value: ${category.isDeleted}`);
    
    res.status(200).json({ success: true, message: 'Category restored successfully' });
  } catch (error) {
    console.error('Restore category error:', error);
    res.status(500).json({ error: 'Failed to restore category' });
  }
};
