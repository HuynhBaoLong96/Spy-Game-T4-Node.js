const mongoose = require('mongoose');

const keywordPairSchema = new mongoose.Schema({
  civilianKeyword: { type: String, required: true },
  spyKeyword: { type: String, required: true },
  category: { type: String, default: 'General' }
}, { timestamps: true });

module.exports = mongoose.model('KeywordPair', keywordPairSchema);
