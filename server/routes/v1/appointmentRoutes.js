const express = require('express');
const router = express.Router();
const {
  createAppointment,
  rescheduleAppointment,
  getClientAppointments,
  cancelAppointment,
  updateAppointmentStatus
} = require('../../controllers/appointmentController');
const { authMiddleware } = require('../../middleware/auth');
const requireRole = require('../../middleware/role');
const {
  createAppointmentValidation,
  cancelAppointmentValidation,
  statusUpdateValidation
} = require('../../validators/appointmentValidator');

router.post('/', authMiddleware, requireRole('client', 'admin'), createAppointmentValidation, createAppointment);
router.get('/me', authMiddleware, getClientAppointments);
router.patch('/:id/cancel', authMiddleware, cancelAppointmentValidation, cancelAppointment);
router.patch('/:id/status', authMiddleware, requireRole('provider', 'admin'), statusUpdateValidation, updateAppointmentStatus);

const { body, param } = require('express-validator');
const { validate } = require('../../validators/authValidator');
router.patch('/:id/reschedule', authMiddleware, requireRole('client', 'admin'), validate([
  param('id').isMongoId(), body('slotStart').isISO8601(), body('holdId').optional().isMongoId()
]), rescheduleAppointment);

module.exports = router;
