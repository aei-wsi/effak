const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

// Import controllers
const authController = require('../controllers/authController');
const householdController = require('../controllers/householdController');
const emergencyContactController = require('../controllers/emergencyContactController');

// Import middleware
const {
  verifyToken,
  optionalAuth,
  requireHouseholdAdmin,
  requireHouseholdAccess,
  requireVerifiedEmail,
  rateLimitPerUser
} = require('../middleware/auth');

// ============================
// Authentication Routes
// ============================

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/auth/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim()
  ],
  authController.register
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/auth/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  authController.login
);

// @route   GET /api/auth/verify-email/:token
// @desc    Verify email address
// @access  Public
router.get(
  '/auth/verify-email/:token',
  [param('token').notEmpty().withMessage('Token is required')],
  authController.verifyEmail
);

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post(
  '/auth/forgot-password',
  [body('email').isEmail().normalizeEmail().withMessage('Valid email is required')],
  authController.forgotPassword
);

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password
// @access  Public
router.post(
  '/auth/reset-password/:token',
  [
    param('token').notEmpty().withMessage('Token is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ],
  authController.resetPassword
);

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post(
  '/auth/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
  authController.refreshToken
);

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/auth/profile', verifyToken, authController.getProfile);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put(
  '/auth/profile',
  [
    verifyToken,
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('phone').optional().trim()
  ],
  authController.updateProfile
);

// @route   POST /api/auth/change-password
// @desc    Change password
// @access  Private
router.post(
  '/auth/change-password',
  [
    verifyToken,
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
  ],
  authController.changePassword
);

// ============================
// Household Routes
// ============================

// @route   GET /api/households
// @desc    Get all households for current user
// @access  Private
router.get('/households', verifyToken, householdController.getHouseholds);

// @route   POST /api/households
// @desc    Create new household
// @access  Private
router.post(
  '/households',
  [
    verifyToken,
    body('name').trim().notEmpty().withMessage('Household name is required')
  ],
  householdController.createHousehold
);

// @route   GET /api/households/:householdId
// @desc    Get household by ID
// @access  Private
router.get(
  '/households/:householdId',
  [verifyToken, param('householdId').isInt().withMessage('Valid household ID is required')],
  householdController.getHouseholdById
);

// @route   PUT /api/households/:householdId
// @desc    Update household
// @access  Private (Admin only)
router.put(
  '/households/:householdId',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    body('name').trim().notEmpty().withMessage('Household name is required')
  ],
  householdController.updateHousehold
);

// @route   DELETE /api/households/:householdId
// @desc    Delete household
// @access  Private (Creator only)
router.delete(
  '/households/:householdId',
  [verifyToken, param('householdId').isInt().withMessage('Valid household ID is required')],
  householdController.deleteHousehold
);

// @route   GET /api/households/:householdId/members
// @desc    Get household members
// @access  Private
router.get(
  '/households/:householdId/members',
  [verifyToken, param('householdId').isInt().withMessage('Valid household ID is required')],
  householdController.getHouseholdMembers
);

// @route   POST /api/households/:householdId/members
// @desc    Add member to household
// @access  Private (Admin only)
router.post(
  '/households/:householdId/members',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('role').optional().isIn(['admin', 'member']).withMessage('Invalid role'),
    body('relationship').optional().trim()
  ],
  householdController.addMember
);

// @route   PUT /api/households/:householdId/members/:memberId
// @desc    Update member role
// @access  Private (Admin only)
router.put(
  '/households/:householdId/members/:memberId',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('memberId').isInt().withMessage('Valid member ID is required'),
    body('role').optional().isIn(['admin', 'member']).withMessage('Invalid role'),
    body('relationship').optional().trim()
  ],
  householdController.updateMemberRole
);

// @route   DELETE /api/households/:householdId/members/:memberId
// @desc    Remove member from household
// @access  Private (Admin only)
router.delete(
  '/households/:householdId/members/:memberId',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('memberId').isInt().withMessage('Valid member ID is required')
  ],
  householdController.removeMember
);

// ============================
// Emergency Contact Routes
// ============================

// @route   GET /api/households/:householdId/emergency-contacts
// @desc    Get all emergency contacts for household
// @access  Private
router.get(
  '/households/:householdId/emergency-contacts',
  [verifyToken, param('householdId').isInt().withMessage('Valid household ID is required')],
  emergencyContactController.getEmergencyContacts
);

// @route   GET /api/households/:householdId/emergency-contacts/:contactId
// @desc    Get emergency contact by ID
// @access  Private
router.get(
  '/households/:householdId/emergency-contacts/:contactId',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('contactId').isInt().withMessage('Valid contact ID is required')
  ],
  emergencyContactController.getEmergencyContactById
);

// @route   POST /api/households/:householdId/emergency-contacts
// @desc    Create emergency contact
// @access  Private (Admin only)
router.post(
  '/households/:householdId/emergency-contacts',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().trim(),
    body('relationship').trim().notEmpty().withMessage('Relationship is required'),
    body('isPrimary').optional().isBoolean(),
    body('notes').optional().trim()
  ],
  emergencyContactController.createEmergencyContact
);

// @route   PUT /api/households/:householdId/emergency-contacts/:contactId
// @desc    Update emergency contact
// @access  Private (Admin only)
router.put(
  '/households/:householdId/emergency-contacts/:contactId',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('contactId').isInt().withMessage('Valid contact ID is required'),
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().trim(),
    body('relationship').optional().trim().notEmpty(),
    body('isPrimary').optional().isBoolean(),
    body('notes').optional().trim()
  ],
  emergencyContactController.updateEmergencyContact
);

// @route   DELETE /api/households/:householdId/emergency-contacts/:contactId
// @desc    Delete emergency contact
// @access  Private (Admin only)
router.delete(
  '/households/:householdId/emergency-contacts/:contactId',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('contactId').isInt().withMessage('Valid contact ID is required')
  ],
  emergencyContactController.deleteEmergencyContact
);

// @route   POST /api/households/:householdId/emergency-contacts/:contactId/permissions
// @desc    Grant permission to emergency contact
// @access  Private (Admin only)
router.post(
  '/households/:householdId/emergency-contacts/:contactId/permissions',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('contactId').isInt().withMessage('Valid contact ID is required'),
    body('categoryId').isInt().withMessage('Category ID is required'),
    body('canView').optional().isBoolean(),
    body('canDownload').optional().isBoolean(),
    body('expiresInHours').optional().isInt({ min: 1 })
  ],
  emergencyContactController.grantPermission
);

// @route   DELETE /api/households/:householdId/emergency-contacts/:contactId/permissions/:permissionId
// @desc    Revoke permission from emergency contact
// @access  Private (Admin only)
router.delete(
  '/households/:householdId/emergency-contacts/:contactId/permissions/:permissionId',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('contactId').isInt().withMessage('Valid contact ID is required'),
    param('permissionId').isInt().withMessage('Valid permission ID is required')
  ],
  emergencyContactController.revokePermission
);

// @route   POST /api/households/:householdId/emergency-contacts/:contactId/send-access
// @desc    Send emergency access link
// @access  Private (Admin only)
router.post(
  '/households/:householdId/emergency-contacts/:contactId/send-access',
  [
    verifyToken,
    param('householdId').isInt().withMessage('Valid household ID is required'),
    param('contactId').isInt().withMessage('Valid contact ID is required'),
    body('method').isIn(['email', 'sms']).withMessage('Method must be email or sms')
  ],
  emergencyContactController.sendEmergencyAccess
);

// ============================
// API Documentation
// ============================

// @route   GET /api/docs
// @desc    Get API documentation
// @access  Public
router.get('/docs', (req, res) => {
  res.json({
    name: 'EFFAK API',
    version: '1.0.0',
    description: 'Emergency Financial First Aid Kit API',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        verifyEmail: 'GET /api/auth/verify-email/:token',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password/:token',
        refreshToken: 'POST /api/auth/refresh',
        profile: 'GET /api/auth/profile',
        updateProfile: 'PUT /api/auth/profile',
        changePassword: 'POST /api/auth/change-password'
      },
      households: {
        getAll: 'GET /api/households',
        create: 'POST /api/households',
        getById: 'GET /api/households/:householdId',
        update: 'PUT /api/households/:householdId',
        delete: 'DELETE /api/households/:householdId',
        getMembers: 'GET /api/households/:householdId/members',
        addMember: 'POST /api/households/:householdId/members',
        updateMember: 'PUT /api/households/:householdId/members/:memberId',
        removeMember: 'DELETE /api/households/:householdId/members/:memberId'
      },
      emergencyContacts: {
        getAll: 'GET /api/households/:householdId/emergency-contacts',
        getById: 'GET /api/households/:householdId/emergency-contacts/:contactId',
        create: 'POST /api/households/:householdId/emergency-contacts',
        update: 'PUT /api/households/:householdId/emergency-contacts/:contactId',
        delete: 'DELETE /api/households/:householdId/emergency-contacts/:contactId',
        grantPermission: 'POST /api/households/:householdId/emergency-contacts/:contactId/permissions',
        revokePermission: 'DELETE /api/households/:householdId/emergency-contacts/:contactId/permissions/:permissionId',
        sendAccess: 'POST /api/households/:householdId/emergency-contacts/:contactId/send-access'
      }
    },
    documentation: 'See README.md for detailed API documentation'
  });
});

module.exports = router;
