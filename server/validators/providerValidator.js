const { body, param } = require('express-validator');
const { validate } = require('./authValidator');

const createProviderValidation = validate([
  body('businessName').trim().notEmpty().withMessage('Business name is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('location').optional().trim(),
  body('description').optional().trim(),
  body('bufferMinutes').optional().isInt({ min: 0 }).withMessage('Buffer minutes must be a non-negative integer'),
  body('cancellationWindowHours').optional().isFloat({ min: 0 }).withMessage('Cancellation window hours must be non-negative')
]);

const createServiceValidation = validate([
  param('id').isMongoId().withMessage('Valid provider ID is required'),
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('durationMins').isInt({ min: 5 }).withMessage('Duration must be at least 5 minutes'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number')
]);

module.exports = {
  createProviderValidation,
  createServiceValidation
};
