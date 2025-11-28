const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getOne } = require('../config/database');

// Verify JWT token
exports.verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authorization denied.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists and is active
    const user = await getOne(
      `SELECT id, email, is_active FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists. Authorization denied.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Authorization denied.'
      });
    }

    // Add user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Authorization denied.'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please log in again.'
      });
    }

    logger.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};

// Optional authentication (doesn't fail if no token)
exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await getOne(
        `SELECT id, email, is_active FROM users WHERE id = $1`,
        [decoded.userId]
      );

      if (user && user.is_active) {
        req.user = {
          userId: decoded.userId,
          email: decoded.email
        };
      } else {
        req.user = null;
      }
    } catch (error) {
      req.user = null;
    }

    next();

  } catch (error) {
    logger.error('Optional auth error:', error);
    req.user = null;
    next();
  }
};

// Check if user has admin role in household
exports.requireHouseholdAdmin = async (req, res, next) => {
  try {
    const { householdId } = req.params;
    const userId = req.user.userId;

    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this household'
      });
    }

    if (membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin privileges required for this action'
      });
    }

    req.householdRole = membership.role;
    next();

  } catch (error) {
    logger.error('Household admin check error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization error',
      error: error.message
    });
  }
};

// Check if user has any access to household
exports.requireHouseholdAccess = async (req, res, next) => {
  try {
    const { householdId } = req.params;
    const userId = req.user.userId;

    const membership = await getOne(
      `SELECT role, id FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this household'
      });
    }

    req.householdRole = membership.role;
    req.householdMemberId = membership.id;
    next();

  } catch (error) {
    logger.error('Household access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization error',
      error: error.message
    });
  }
};

// Verify email is verified
exports.requireVerifiedEmail = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await getOne(
      `SELECT email_verified FROM users WHERE id = $1`,
      [userId]
    );

    if (!user || !user.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required to access this resource'
      });
    }

    next();

  } catch (error) {
    logger.error('Email verification check error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification error',
      error: error.message
    });
  }
};

// Rate limiting per user
const userRequestCounts = new Map();

exports.rateLimitPerUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const userId = req.user?.userId;

    if (!userId) {
      return next();
    }

    const now = Date.now();
    const userKey = `user:${userId}`;

    if (!userRequestCounts.has(userKey)) {
      userRequestCounts.set(userKey, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    const userData = userRequestCounts.get(userKey);

    if (now > userData.resetTime) {
      userData.count = 1;
      userData.resetTime = now + windowMs;
      return next();
    }

    if (userData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((userData.resetTime - now) / 1000)
      });
    }

    userData.count++;
    next();
  };
};

// Clean up old rate limit data periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of userRequestCounts.entries()) {
    if (now > data.resetTime) {
      userRequestCounts.delete(key);
    }
  }
}, 60 * 60 * 1000); // Clean up every hour

module.exports = exports;
