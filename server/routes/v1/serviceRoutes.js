const express = require('express');
const router = express.Router();
const { updateService, deleteService } = require('../../controllers/serviceController');
const { authMiddleware } = require('../../middleware/auth');
const requireRole = require('../../middleware/role');

router.patch('/:id', authMiddleware, requireRole('provider', 'admin'), updateService);
router.delete('/:id', authMiddleware, requireRole('provider', 'admin'), deleteService);

module.exports = router;
