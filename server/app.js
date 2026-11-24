const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

// Route Imports
const authRoutes = require('./routes/v1/authRoutes');
const providerRoutes = require('./routes/v1/providerRoutes');
const serviceRoutes = require('./routes/v1/serviceRoutes');
const appointmentRoutes = require('./routes/v1/appointmentRoutes');
const walletRoutes = require('./routes/v1/walletRoutes');
const adminRoutes = require('./routes/v1/adminRoutes');

const app = express();

// Hardening & Security Middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later.' } }
});
app.use('/api/v1/auth', authLimiter);

// Versioned API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/wallet', walletRoutes);

// Root health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
