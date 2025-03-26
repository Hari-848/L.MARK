document.addEventListener('DOMContentLoaded', function() {
  const addressModal = document.getElementById('addressModal');
  const addressForm = document.getElementById('addressForm');
  const addNewAddressBtn = document.getElementById('addNewAddressBtn');
  const closeAddressModal = document.getElementById('closeAddressModal');
  const cancelAddressBtn = document.getElementById('cancelAddressBtn');
  const addressModalTitle = document.getElementById('addressModalTitle');
  
  // Make address cards clickable to select the radio button
  document.querySelectorAll('.address-card').forEach(card => {
    card.addEventListener('click', function(e) {
      // Don't trigger if clicking on buttons
      if (e.target.closest('button')) return;
      
      const radio = this.querySelector('input[type="radio"]');
      radio.checked = true;
      
      // Update UI for all cards
      document.querySelectorAll('.address-card').forEach(c => {
        c.classList.remove('border-indigo-500', 'bg-indigo-50');
        c.classList.add('border-gray-200');
      });
      
      // Highlight selected card
      this.classList.remove('border-gray-200');
      this.classList.add('border-indigo-500', 'bg-indigo-50');
    });
  });
  
  // Open address modal for new address
  addNewAddressBtn.addEventListener('click', function() {
    addressForm.reset();
    document.getElementById('addressId').value = '';
    addressModalTitle.textContent = 'Add New Address';
    addressModal.classList.remove('hidden');
  });
  
  // Close address modal
  function closeModal() {
    addressModal.classList.add('hidden');
  }
  
  closeAddressModal.addEventListener('click', closeModal);
  cancelAddressBtn.addEventListener('click', closeModal);
  
  // Edit address
  document.querySelectorAll('.edit-address').forEach(button => {
    button.addEventListener('click', async function(e) {
      e.stopPropagation(); // Prevent triggering the card click
      const addressId = this.getAttribute('data-id');
      try {
        const response = await fetch(`/address/${addressId}`);
        if (response.ok) {
          const address = await response.json();
          
          // Fill form with address data
          document.getElementById('addressId').value = address._id;
          document.getElementById('name').value = address.name;
          document.getElementById('mobile').value = address.mobile;
          document.getElementById('address').value = address.address;
          document.getElementById('city').value = address.city;
          document.getElementById('state').value = address.state;
          document.getElementById('pincode').value = address.pincode;
          document.getElementById('isDefault').checked = address.isDefault;
          
          // Update modal title and show
          addressModalTitle.textContent = 'Edit Address';
          addressModal.classList.remove('hidden');
        } else {
          alert('Failed to fetch address details');
        }
      } catch (error) {
        console.error('Error fetching address:', error);
        alert('An error occurred while fetching address details');
      }
    });
  });
  
  // Delete address
  document.querySelectorAll('.delete-address').forEach(button => {
    button.addEventListener('click', async function(e) {
      e.stopPropagation(); // Prevent triggering the card click
      if (confirm('Are you sure you want to delete this address?')) {
        const addressId = this.getAttribute('data-id');
        try {
          const response = await fetch(`/address/${addressId}`, {
            method: 'DELETE'
          });
          
          if (response.ok) {
            window.location.reload();
          } else {
            const error = await response.json();
            alert(error.error || 'Failed to delete address');
          }
        } catch (error) {
          console.error('Error deleting address:', error);
          alert('An error occurred while deleting the address');
        }
      }
    });
  });
  
  // Make address default
  document.querySelectorAll('.make-default').forEach(button => {
    button.addEventListener('click', async function(e) {
      e.stopPropagation(); // Prevent triggering the card click
      const addressId = this.getAttribute('data-id');
      try {
        const response = await fetch(`/address/${addressId}/default`, {
          method: 'PUT'
        });
        
        if (response.ok) {
          window.location.reload();
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to set default address');
        }
      } catch (error) {
        console.error('Error setting default address:', error);
        alert('An error occurred while setting default address');
      }
    });
  });
  
  // Save address form
  addressForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(addressForm);
    const addressData = {
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      address: formData.get('address'),
      city: formData.get('city'),
      state: formData.get('state'),
      pincode: formData.get('pincode'),
      isDefault: formData.get('isDefault') === 'on'
    };
    
    const addressId = formData.get('addressId');
    const url = addressId ? `/address/${addressId}` : '/address';
    const method = addressId ? 'PUT' : 'POST';
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(addressData)
      });
      
      if (response.ok) {
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save address');
      }
    } catch (error) {
      console.error('Error saving address:', error);
      alert('An error occurred while saving your address');
    }
  });
  
  // Place order
  document.getElementById('placeOrderBtn').addEventListener('click', async function() {
    const selectedAddressRadio = document.querySelector('input[name="selectedAddress"]:checked');
    
    if (!selectedAddressRadio) {
      alert('Please select a delivery address');
      return;
    }
    
    const addressId = selectedAddressRadio.value;
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    
    try {
      const response = await fetch('/order/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          addressId,
          paymentMethod
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        window.location.href = `/order/success/${result.orderId}`;
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to place order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      alert('An error occurred while placing your order');
    }
  });
}); 