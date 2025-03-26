const Address = require('../../Models/addressModel');

// Get all addresses for a user
exports.getAddresses = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    res.json(addresses);
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Failed to get addresses' });
  }
};

// Get a single address
exports.getAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;
    
    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    res.json(address);
  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({ error: 'Failed to get address' });
  }
};

// Create a new address
exports.createAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { name, mobile, address, city, state, pincode, isDefault } = req.body;
    
    // Validate required fields
    if (!name || !mobile || !address || !city || !state || !pincode) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Create new address with field names matching the schema
    const newAddress = new Address({
      userId,
      name,
      mobile,
      address,
      city,
      state,
      pincode,
      isDefault: isDefault || false
    });
    
    // If this is the first address or marked as default, ensure it's set as default
    if (isDefault) {
      await Address.updateMany(
        { userId, _id: { $ne: newAddress._id } },
        { $set: { isDefault: false } }
      );
    } else {
      // If no addresses exist yet, make this the default
      const addressCount = await Address.countDocuments({ userId });
      if (addressCount === 0) {
        newAddress.isDefault = true;
      }
    }
    
    await newAddress.save();
    res.status(201).json(newAddress);
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ error: 'Failed to create address' });
  }
};

// Update an address
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;
    const { name, mobile, address, city, state, pincode, isDefault } = req.body;
    
    // Validate required fields
    if (!name || !mobile || !address || !city || !state || !pincode) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Find the address
    const existingAddress = await Address.findOne({ _id: addressId, userId });
    
    if (!existingAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    // Update address fields
    existingAddress.name = name;
    existingAddress.mobile = mobile;
    existingAddress.address = address;
    existingAddress.city = city;
    existingAddress.state = state;
    existingAddress.pincode = pincode;
    
    // Handle default address
    if (isDefault && !existingAddress.isDefault) {
      await Address.updateMany(
        { userId, _id: { $ne: addressId } },
        { $set: { isDefault: false } }
      );
      existingAddress.isDefault = true;
    }
    
    await existingAddress.save();
    res.json(existingAddress);
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
};

// Delete an address
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;
    
    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    // Don't allow deleting the default address
    if (address.isDefault) {
      return res.status(400).json({ error: 'Cannot delete default address' });
    }
    
    await Address.deleteOne({ _id: addressId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
};

// Set an address as default
exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.id;
    
    // Find the address
    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    // Update all addresses to set isDefault to false
    await Address.updateMany(
      { userId },
      { $set: { isDefault: false } }
    );
    
    // Set this address as default
    await Address.findByIdAndUpdate(
      addressId,
      { $set: { isDefault: true } },
      { runValidators: false }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ error: 'Failed to set default address' });
  }
}; 