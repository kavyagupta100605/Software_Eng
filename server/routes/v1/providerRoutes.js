const { createHold, releaseHold } = require('../../services/slotHolds');
const express = require('express');
const router = express.Router();
const { listProviders, getProviderById, createProvider, updateProvider } = require('../../controllers/providerController');
const { getProviderServices, createService } = require('../../controllers/serviceController');
const { getAvailability, updateAvailability, addBlockedRange, removeBlockedRange, getSlots, joinSlotWaitlist } = require('../../controllers/availabilityController');
const { getProviderAppointments } = require('../../controllers/appointmentController');
const { authMiddleware, optionalAuthMiddleware } = require('../../middleware/auth');
const requireRole = require('../../middleware/role');
const { createProviderValidation, createServiceValidation, updateProviderValidation } = require('../../validators/providerValidator');

const { body, param } = require('express-validator');
const { validate } = require('../../validators/authValidator');

// Public provider browsing
router.get('/', listProviders);
router.get('/:id', getProviderById);

// Provider profile management
router.post('/', authMiddleware, requireRole('provider', 'admin'), createProviderValidation, createProvider);
router.patch('/:id', authMiddleware, requireRole('provider', 'admin'), updateProviderValidation, updateProvider);

// Provider Services
router.get('/:id/services', optionalAuthMiddleware, getProviderServices);
router.post('/:id/services', authMiddleware, requireRole('provider', 'admin'), createServiceValidation, createService);

// Provider Appointments
router.get('/:id/appointments', authMiddleware, requireRole('provider', 'admin'), getProviderAppointments);

// Availability & Slots
router.get('/:id/availability', getAvailability);
router.put('/:id/availability', authMiddleware, requireRole('provider', 'admin'), updateAvailability);
router.post('/:id/availability/block', authMiddleware, requireRole('provider', 'admin'), addBlockedRange);
router.delete('/:id/availability/block/:blockId', authMiddleware, requireRole('provider', 'admin'),
  validate([param('id').isMongoId(), param('blockId').isMongoId()]), removeBlockedRange);
router.get('/:id/slots', optionalAuthMiddleware, getSlots);
router.post('/:id/waitlist', authMiddleware, requireRole('client', 'admin'), validate([
  param('id').isMongoId(),
  body('serviceId').isMongoId(),
  body('slotStart').isISO8601()
]), joinSlotWaitlist);

router.post('/:id/holds', authMiddleware, requireRole('client', 'admin'), validate([
  param('id').isMongoId(), body('serviceId').isMongoId(), body('slotStart').isISO8601()
]), async (req, res, next) => {
  try {
    const hold = await createHold(req.params.id, req.body.serviceId, req.user.id, new Date(req.body.slotStart));
    res.status(201).json({ data: { id: hold._id, expiresAt: hold.expiresAt } });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/holds/:holdId', authMiddleware, validate([param('holdId').isMongoId()]), async (req, res, next) => {
  try {
    await releaseHold(req.params.holdId, req.user.id);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
