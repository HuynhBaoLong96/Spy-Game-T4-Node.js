const KeywordPair = require('../models/KeywordPair');
const { getRandomKeywordPair } = require('../services/keywordService');

/**
 * @desc    Lấy toàn bộ keyword pairs
 * @route   GET /api/keywords
 */
const getAllKeywords = async (req, res, next) => {
  try {
    const keywords = await KeywordPair.find();
    res.json(keywords);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Random 1 keyword pair
 * @route   GET /api/keywords/random
 */
const getRandomKeyword = async (req, res, next) => {
  try {
    const keyword = await getRandomKeywordPair();
    res.json(keyword);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllKeywords,
  getRandomKeyword,
};
