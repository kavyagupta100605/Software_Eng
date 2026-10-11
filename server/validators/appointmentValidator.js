const { body, param, query } = require('express-validator');
const { validate } = require('./authValidator');

const createAppointmentValidation = validate([
  body('providerId').isMongoId().withMessage('Valid providerId is required'),
  body('serviceId').isMongoId().withMessage('Valid serviceId is required'),
  body('slotStart').isISO8601().withMessage('Valid slotStart ISO date-time is required')
]);

const cancelAppointmentValidation = validate([
  param('id').isMongoId().withMessage('Valid appointment ID is required')
]);

const statusUpdateValidation = validate([
  param('id').isMongoId().withMessage('Valid appointment ID is required'),
  body('status').isIn(['completed', 'no-show', 'cancelled']).withMessage('Status must be completed, no-show, or cancelled')
]);

module.exports = {
  createAppointmentValidation,
  cancelAppointmentValidation,
  statusUpdateValidation
};
