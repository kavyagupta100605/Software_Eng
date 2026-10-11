const express = require('express');
const router = express.Router();
const {
  createAppointment,
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

module.exports = router;
