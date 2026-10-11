const express = require('express');
const router = express.Router();
const { getAllProviders, toggleProviderApproval, getAllAppointments } = require('../../controllers/adminController');
const { authMiddleware } = require('../../middleware/auth');
const requireRole = require('../../middleware/role');

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/providers', getAllProviders);
router.patch('/providers/:id/approve', toggleProviderApproval);
router.get('/appointments', getAllAppointments);

module.exports = router;
