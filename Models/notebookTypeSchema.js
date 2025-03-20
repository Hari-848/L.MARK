const mongoose = require('mongoose');
const { Schema } = mongoose;

const notebookTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const NotebookType = mongoose.model('NotebookType', notebookTypeSchema);

module.exports = NotebookType;
