const { body, param } = require('express-validator');
const { validate } = require('./authValidator');

const providerFields = (partial = false) => [
  (partial ? body('businessName').optional() : body('businessName')).isString().bail().trim().notEmpty().isLength({ max: 200 }),
  (partial ? body('category').optional() : body('category')).isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('location').optional().isString().bail().trim().isLength({ max: 500 }),
  body('description').optional().isString().bail().trim().isLength({ max: 5000 }),
  body('bufferMinutes').optional().isInt({ min: 0, max: 1440 }).withMessage('Buffer minutes must be an integer from 0 to 1440').toInt(),
  body('cancellationWindowHours').optional().isFloat({ min: 0, max: 8760 }).withMessage('Cancellation window must be between 0 and 8760 hours').toFloat()
];
const serviceFields = (partial = false) => [
  (partial ? body('name').optional() : body('name')).isString().bail().trim().notEmpty().isLength({ max: 200 }),
  (partial ? body('durationMins').optional() : body('durationMins')).isInt({ min: 5, max: 1440 }).withMessage('Duration must be an integer from 5 to 1440 minutes').toInt(),
  (partial ? body('price').optional() : body('price')).isFloat({ min: 0, max: 1000000 }).withMessage('Price must be between 0 and 1000000').toFloat()
];
const idField = () => param('id').isMongoId().withMessage('Valid ID is required');

module.exports = {
  createProviderValidation: validate(providerFields()),
  updateProviderValidation: validate([idField(), ...providerFields(true)]),
  createServiceValidation: validate([idField(), ...serviceFields()]),
  updateServiceValidation: validate([idField(), ...serviceFields(true)])
};
