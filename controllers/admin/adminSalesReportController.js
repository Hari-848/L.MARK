const Order = require('../../Models/orderModel');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Helper function to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount);
};

// Helper function to format date
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN');
};

// Helper function to calculate date range
const getDateRange = (type) => {
  const now = new Date();
  let start, end;

  switch (type) {
    case 'daily':
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    case 'weekly':
      start = new Date(now);
      start.setDate(now.getDate() - now.getDay()); // Set to Sunday
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6); // Set to Saturday
      end.setHours(23, 59, 59, 999);
      break;
    case 'yearly':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    default:
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

// Add this helper function
const getDateRangeFromRequest = async (req) => {
  const { type, startDate, endDate } = req.query;

  if (type) {
    const now = new Date();
    let start, end;

    switch (type) {
      case 'daily':
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'weekly':
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'yearly':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        throw new Error('Invalid report type');
    }
    return { startDate: start, endDate: end };
  } else if (startDate && endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Reset time components to ensure accurate date comparison
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // Validate future dates
    if (start > today || end > today) {
      throw new Error('Future dates cannot be selected. Please select dates up to today.');
    }

    // Validate date range
    if (start > end) {
      throw new Error('Start date cannot be after end date. Please select a valid date range.');
    }

    // Validate date range is not too large (optional: limit to 1 year)
    const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
    if (end - start > oneYearInMs) {
      throw new Error('Date range cannot exceed one year. Please select a smaller range.');
    }

    return {
      startDate: start,
      endDate: end
    };
  }
  throw new Error('Invalid date range parameters');
};

// Generate sales report data
const generateSalesReport = async (startDate, endDate, page = 1, limit = 10) => {
  try {
    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    if (startDate > endDate) {
      throw new Error('Start date cannot be after end date');
    }

    console.log('Fetching orders between:', startDate, 'and', endDate);
    
    // First, get all orders within date range for total calculations
    const allOrders = await Order.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    }).lean();

    if (!allOrders || !Array.isArray(allOrders)) {
      throw new Error('Failed to fetch orders');
    }

    // Initialize counters
    let totalSales = 0;
    let totalDiscounts = 0;
    let orderCounts = {
      total: allOrders.length,
      delivered: 0,
      processing: 0,
      shipped: 0,
      cancelled: 0,
      returned: 0
    };

    // Calculate totals and count orders by status
    allOrders.forEach(order => {
      if (!order || typeof order !== 'object') return;
      
      // Count orders by status
      const status = order.orderStatus || 'processing';
      orderCounts[status] = (orderCounts[status] || 0) + 1;
      
      // Only include delivered orders in sales calculations
      if (status === 'delivered') {
        const orderSubtotal = Number(order.subtotal) || 0;
        const orderDiscount = Number(order.discount) || 0;
        const orderTotal = Number(order.total) || 0;
        totalSales += orderTotal;
        totalDiscounts += orderDiscount;
      }
    });

    // Calculate total pages
    const totalOrders = allOrders.length;
    const totalPages = Math.ceil(totalOrders / limit);
    const skip = (page - 1) * limit;
    
    // Fetch paginated orders for display
    const paginatedOrders = await Order.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('userId', 'email')
    .populate({
      path: 'items.productId',
      select: 'productName'
    })
    .populate({
      path: 'items.variantId',
      select: 'variantType price'
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

    if (!paginatedOrders || !Array.isArray(paginatedOrders)) {
      throw new Error('Failed to fetch paginated orders');
    }

    // Prepare order details for display
    const orderDetails = paginatedOrders.map(order => ({
      orderId: order._id,
      date: order.createdAt,
      total: Number(order.subtotal) || 0,
      discount: Number(order.discount) || 0,
      netAmount: Number(order.total) || 0,
      paymentMethod: order.paymentMethod || 'N/A',
      couponCode: order.couponCode || 'N/A',
      status: order.orderStatus || 'processing',
      userEmail: order.userId?.email || 'N/A'
    }));

    return {
      totalSales,
      totalDiscounts,
      totalOrders,
      orderCounts,
      orderDetails,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalOrders,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      dateRange: {
        start: startDate,
        end: endDate
      }
    };
  } catch (error) {
    console.error('Error generating sales report:', error);
    throw error;
  }
};

// Generate PDF report
const generatePDFReport = async (reportData) => {
  const doc = new PDFDocument();
  const fileName = `sales-report-${Date.now()}.pdf`;
  const filePath = path.join(__dirname, '../../public/reports', fileName);

  // Create reports directory if it doesn't exist
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Add title
  doc.fontSize(24)
    .font('Helvetica-Bold')
    .text('Sales Report', { align: 'center' })
    .moveDown(0.5);

  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' })
    .moveDown(1);

  // Add date range
  doc
    .fontSize(12)
    .font('Helvetica')
    .text(`Period: ${formatDate(reportData.dateRange.start)} to ${formatDate(reportData.dateRange.end)}`, { align: 'center' })
    .moveDown(1);

  // Add summary
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('Summary')
    .moveDown(0.3);
  doc
    .fontSize(12)
    .font('Helvetica')
    .text(`Total Orders: ${reportData.totalOrders}`)
    .text(`Total Sales: ${formatCurrency(reportData.totalSales)}`)
    .text(`Total Discounts: ${formatCurrency(reportData.totalDiscounts)}`)
    .moveDown(1);

  // Add order details
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('Order Details')
    .moveDown(0.5);

  reportData.orderDetails.forEach(order => {
    doc.fontSize(10).text(`Order ID: ${order.orderId}`);
    doc.text(`Date: ${formatDate(order.date)}`);
    doc.text(`Total: ${formatCurrency(order.total)}`);
    doc.text(`Discount: ${formatCurrency(order.discount)}`);
    doc.text(`Net Amount: ${formatCurrency(order.netAmount)}`);
    doc.text(`Payment Method: ${order.paymentMethod}`);
    doc.text(`Coupon Code: ${order.couponCode}`);
    doc.moveDown();
  });

  doc.end();
  return fileName;
};

// Generate Excel report
const generateExcelReport = async (reportData) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');
  const fileName = `sales-report-${Date.now()}.xlsx`;
  const filePath = path.join(__dirname, '../../public/reports', fileName);

  // Create reports directory if it doesn't exist
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  // Add headers
  worksheet.columns = [
    { header: 'Order ID', key: 'orderId', width: 20 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Total', key: 'total', width: 15 },
    { header: 'Discount', key: 'discount', width: 15 },
    { header: 'Net Amount', key: 'netAmount', width: 15 },
    { header: 'Payment Method', key: 'paymentMethod', width: 15 },
    { header: 'Coupon Code', key: 'couponCode', width: 15 }
  ];

  // Add data
  reportData.orderDetails.forEach(order => {
    worksheet.addRow({
      orderId: order.orderId,
      date: formatDate(order.date),
      total: order.total,
      discount: order.discount,
      netAmount: order.netAmount,
      paymentMethod: order.paymentMethod,
      couponCode: order.couponCode
    });
  });

  // Add summary
  worksheet.addRow([]);
  worksheet.addRow(['Summary']);
  worksheet.addRow(['Total Orders', reportData.totalOrders]);
  worksheet.addRow(['Total Sales', reportData.totalSales]);
  worksheet.addRow(['Total Discounts', reportData.totalDiscounts]);

  await workbook.xlsx.writeFile(filePath);
  return fileName;
};

// Render sales report page
exports.getSalesReportPage = async (req, res) => {
  try {
    res.render('admin/salesReport', {
      title: 'Sales Report',
      admin: req.session.admin
    });
  } catch (error) {
    console.error('Error rendering sales report page:', error);
    res.status(500).send('Error rendering sales report page');
  }
};

// Get sales report data (API endpoint)
exports.getSalesReport = async (req, res) => {
  try {
    console.log('Received request with query:', req.query);
    
    const { startDate, endDate, type, page = 1 } = req.query;
    const currentPage = Math.max(1, parseInt(page)); // Ensure page is at least 1
    let dateRange;

    if (type) {
      dateRange = getDateRange(type);
    } else if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate),
        end: new Date(endDate)
      };
    } else {
      // Default to today's report
      dateRange = getDateRange('daily');
    }

    console.log('Calculated date range:', {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString()
    });

    const report = await generateSalesReport(dateRange.start, dateRange.end, currentPage);
    
    // Validate pagination data
    if (!report.pagination || report.pagination.currentPage < 1) {
      throw new Error('Invalid pagination data received');
    }

    console.log('Generated report:', report);

    res.json(report);
  } catch (error) {
    console.error('Detailed error in getSalesReport:', error);
    res.status(500).json({ 
      error: 'Failed to generate sales report',
      details: error.message 
    });
  }
};

// Add this function at the top level of the file
const ensureReportDirectory = () => {
  const reportDir = path.join(__dirname, '../../public/reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  return reportDir;
};

// Export the download functions
exports.downloadPDFReport = async (req, res) => {
  try {
    const reportDir = ensureReportDirectory();
    const { startDate, endDate } = await getDateRangeFromRequest(req);
    const report = await generateSalesReport(startDate, endDate);
    
    const filename = `sales-report-${Date.now()}.pdf`;
    const filepath = path.join(reportDir, filename);
    
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Header with branding
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Sales Report', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' })
      .moveDown(1);

    // Date range section
    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Period: ${formatDate(startDate)} to ${formatDate(endDate)}`, { align: 'center' })
      .moveDown(1);

    // Summary Section
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Summary')
      .moveDown(0.3);
    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Total Orders: ${report.totalOrders}`)
      .text(`Total Sales: ${formatCurrency(report.totalSales)}`)
      .text(`Total Discounts: ${formatCurrency(report.totalDiscounts)}`)
      .moveDown(1);

    // Orders by Status
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Orders by Status')
      .moveDown(0.3);

    Object.entries(report.orderCounts).forEach(([status, count]) => {
      if (status !== 'total') {
        doc.fontSize(12).font('Helvetica').text(`${status}: ${count}`);
      }
    });

    doc.moveDown(1).moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke().moveDown(1);

    // Order Details Section
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Order Details')
      .moveDown(0.5);

    // Add order details
    if (report.orderDetails && report.orderDetails.length > 0) {
    report.orderDetails.forEach(order => {
        // Check if we need a new page
        if (doc.y > 700) {
          doc.addPage();
        }

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(`Order ID: ${order.orderId}`, { continued: true })
          .font('Helvetica')
          .text(`  (${formatDate(order.date)})`);
        
        doc
          .fontSize(10)
        .text(`Customer: ${order.userEmail}`)
          .text(`Total: ${formatCurrency(order.total)} | Discount: ${formatCurrency(order.discount)} | Net: ${formatCurrency(order.netAmount)}`)
          .text(`Payment Method: ${order.paymentMethod} | Status: ${order.status}`)
          .text(`Coupon: ${order.couponCode || 'N/A'}`)
          .moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(0.5);
    });
    } else {
      doc
        .fontSize(12)
        .font('Helvetica')
        .text('No orders found for the selected period')
        .moveDown(1);
    }

    // Add page numbers
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).text(`Page ${i + 1} of ${pages.count}`, 50, 740, {
        align: 'center',
        width: 500
      });
    }

    doc.end();

    stream.on('finish', () => {
      res.download(filepath, filename, err => {
        if (err) {
          console.error('Download error:', err);
          res.status(500).send('Download failed');
        }
        fs.unlink(filepath, err => {
          if (err) console.error('File deletion error:', err);
        });
      });
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err);
      res.status(500).json({ error: 'PDF generation failed' });
    });

  } catch (error) {
    console.error('PDF generation failed:', error);
    res.status(500).json({ error: 'PDF report generation failed' });
  }
};


exports.downloadExcelReport = async (req, res) => {
  try {
    const reportDir = ensureReportDirectory();
    const { startDate, endDate } = await getDateRangeFromRequest(req);
    const report = await generateSalesReport(startDate, endDate);
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');
    
    // Add title
    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = 'Sales Report';
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getCell('A1').font = { size: 16, bold: true };
    
    // Add date range
    worksheet.mergeCells('A2:H2');
    worksheet.getCell('A2').value = `Period: ${formatDate(startDate)} to ${formatDate(endDate)}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    
    // Add summary
    worksheet.addRow([]);
    worksheet.addRow(['Summary']);
    worksheet.addRow(['Total Orders', report.totalOrders]);
    worksheet.addRow(['Total Sales', report.totalSales]);
    worksheet.addRow(['Total Discounts', report.totalDiscounts]);
    
    // Add order status breakdown
    worksheet.addRow([]);
    worksheet.addRow(['Orders by Status']);
    Object.entries(report.orderCounts).forEach(([status, count]) => {
      if (status !== 'total') {
        worksheet.addRow([status.charAt(0).toUpperCase() + status.slice(1), count]);
      }
    });
    
    // Add order details
    worksheet.addRow([]);
    worksheet.addRow(['Order Details']);
    worksheet.addRow([
      'Order ID',
      'Date',
      'Customer',
      'Total',
      'Discount',
      'Net Amount',
      'Payment Method',
      'Status',
      'Coupon Code'
    ]);
    
    report.orderDetails.forEach(order => {
      worksheet.addRow([
        order.orderId,
        formatDate(order.date),
        order.userEmail,
        formatCurrency(order.total),
        formatCurrency(order.discount),
        formatCurrency(order.netAmount),
        order.paymentMethod,
        order.status,
        order.couponCode
      ]);
    });
    
    // Style the worksheet
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
    
    // Save the workbook
    const filename = `sales-report-${Date.now()}.xlsx`;
    const filepath = path.join(reportDir, filename);
    
    await workbook.xlsx.writeFile(filepath);
    
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).send('Error downloading file');
      }
      // Delete the file after download
      fs.unlink(filepath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temporary file:', unlinkErr);
      });
    });
  } catch (error) {
    console.error('Error generating Excel report:', error);
    res.status(500).json({ error: 'Failed to generate Excel report' });
  }
}; 