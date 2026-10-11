const express = require('express');
const router = express.Router();
const { listProviders, getProviderById, createProvider, updateProvider } = require('../../controllers/providerController');
const { getProviderServices, createService } = require('../../controllers/serviceController');
const { getAvailability, updateAvailability, addBlockedRange, getSlots } = require('../../controllers/availabilityController');
const { getProviderAppointments } = require('../../controllers/appointmentController');
const { authMiddleware } = require('../../middleware/auth');
const requireRole = require('../../middleware/role');
const { createProviderValidation, createServiceValidation } = require('../../validators/providerValidator');

// Public provider browsing
router.get('/', listProviders);
router.get('/:id', getProviderById);

// Provider profile management
router.post('/', authMiddleware, requireRole('provider', 'admin'), createProviderValidation, createProvider);
router.patch('/:id', authMiddleware, requireRole('provider', 'admin'), updateProvider);

// Provider Services
router.get('/:id/services', getProviderServices);
router.post('/:id/services', authMiddleware, requireRole('provider', 'admin'), createServiceValidation, createService);

// Provider Appointments
router.get('/:id/appointments', authMiddleware, requireRole('provider', 'admin'), getProviderAppointments);

// Availability & Slots
router.get('/:id/availability', getAvailability);
router.put('/:id/availability', authMiddleware, requireRole('provider', 'admin'), updateAvailability);
router.post('/:id/availability/block', authMiddleware, requireRole('provider', 'admin'), addBlockedRange);
router.get('/:id/slots', getSlots);

module.exports = router;
