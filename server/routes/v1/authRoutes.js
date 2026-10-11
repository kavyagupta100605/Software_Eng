const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../../controllers/authController');
const { registerValidation, loginValidation } = require('../../validators/authValidator');
const { authMiddleware } = require('../../middleware/auth');

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/me', authMiddleware, getMe);

module.exports = router;
