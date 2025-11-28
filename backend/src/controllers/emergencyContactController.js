const { query, getOne, getMany, execute, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { sendEmail, sendSMS } = require('../utils/email');
const crypto = require('crypto');

// Get all emergency contacts for a household
exports.getEmergencyContacts = async (req, res) => {
  try {
    const { householdId } = req.params;
    const userId = req.user.userId;

    // Verify access to household
    const membership = await getOne(
      `SELECT id FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this household'
      });
    }

    const contacts = await getMany(
      `SELECT ec.id, ec.household_id, ec.first_name, ec.last_name, ec.email, ec.phone,
              ec.relationship, ec.is_primary, ec.notes, ec.created_at, ec.updated_at,
              COUNT(DISTINCT ecp.id) as permission_count,
              u.first_name as added_by_first_name, u.last_name as added_by_last_name
       FROM emergency_contacts ec
       INNER JOIN users u ON ec.added_by = u.id
       LEFT JOIN emergency_contact_permissions ecp ON ec.id = ecp.contact_id
       WHERE ec.household_id = $1
       GROUP BY ec.id, ec.household_id, ec.first_name, ec.last_name, ec.email, ec.phone,
                ec.relationship, ec.is_primary, ec.notes, ec.created_at, ec.updated_at,
                u.first_name, u.last_name
       ORDER BY ec.is_primary DESC, ec.created_at DESC`,
      [householdId]
    );

    res.json({
      success: true,
      data: contacts.map(c => ({
        id: c.id,
        householdId: c.household_id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        relationship: c.relationship,
        isPrimary: c.is_primary,
        notes: c.notes,
        permissionCount: parseInt(c.permission_count),
        addedBy: {
          firstName: c.added_by_first_name,
          lastName: c.added_by_last_name
        },
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }))
    });

  } catch (error) {
    logger.error('Get emergency contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emergency contacts',
      error: error.message
    });
  }
};

// Get emergency contact by ID
exports.getEmergencyContactById = async (req, res) => {
  try {
    const { householdId, contactId } = req.params;
    const userId = req.user.userId;

    // Verify access
    const membership = await getOne(
      `SELECT id FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this household'
      });
    }

    // Get contact details
    const contact = await getOne(
      `SELECT ec.*, u.first_name as added_by_first_name, u.last_name as added_by_last_name
       FROM emergency_contacts ec
       INNER JOIN users u ON ec.added_by = u.id
       WHERE ec.id = $1 AND ec.household_id = $2`,
      [contactId, householdId]
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found'
      });
    }

    // Get permissions
    const permissions = await getMany(
      `SELECT ecp.id, ecp.category_id, ecp.can_view, ecp.can_download, ecp.expires_at,
              dc.name as category_name, dc.description as category_description
       FROM emergency_contact_permissions ecp
       INNER JOIN document_categories dc ON ecp.category_id = dc.id
       WHERE ecp.contact_id = $1
       ORDER BY dc.name`,
      [contactId]
    );

    // Get access logs
    const accessLogs = await getMany(
      `SELECT id, accessed_at, ip_address, action, document_id
       FROM emergency_access_logs
       WHERE contact_id = $1
       ORDER BY accessed_at DESC
       LIMIT 50`,
      [contactId]
    );

    res.json({
      success: true,
      data: {
        id: contact.id,
        householdId: contact.household_id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        isPrimary: contact.is_primary,
        notes: contact.notes,
        addedBy: {
          firstName: contact.added_by_first_name,
          lastName: contact.added_by_last_name
        },
        permissions: permissions.map(p => ({
          id: p.id,
          categoryId: p.category_id,
          categoryName: p.category_name,
          categoryDescription: p.category_description,
          canView: p.can_view,
          canDownload: p.can_download,
          expiresAt: p.expires_at
        })),
        accessLogs: accessLogs.map(log => ({
          id: log.id,
          accessedAt: log.accessed_at,
          ipAddress: log.ip_address,
          action: log.action,
          documentId: log.document_id
        })),
        createdAt: contact.created_at,
        updatedAt: contact.updated_at
      }
    });

  } catch (error) {
    logger.error('Get emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emergency contact',
      error: error.message
    });
  }
};

// Create emergency contact
exports.createEmergencyContact = async (req, res) => {
  try {
    const { householdId } = req.params;
    const { firstName, lastName, email, phone, relationship, isPrimary, notes } = req.body;
    const userId = req.user.userId;

    // Verify admin access
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add emergency contacts'
      });
    }

    // Check max contacts limit
    const contactCount = await getOne(
      `SELECT COUNT(*) as count FROM emergency_contacts WHERE household_id = $1`,
      [householdId]
    );

    const maxContacts = parseInt(process.env.MAX_EMERGENCY_CONTACTS) || 10;
    if (parseInt(contactCount.count) >= maxContacts) {
      return res.status(400).json({
        success: false,
        message: `Maximum of ${maxContacts} emergency contacts allowed per household`
      });
    }

    // If setting as primary, remove primary flag from others
    if (isPrimary) {
      await execute(
        `UPDATE emergency_contacts SET is_primary = false WHERE household_id = $1`,
        [householdId]
      );
    }

    // Create contact
    const result = await execute(
      `INSERT INTO emergency_contacts (household_id, first_name, last_name, email, phone, relationship, is_primary, notes, added_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [householdId, firstName, lastName, email, phone, relationship, isPrimary || false, notes, userId]
    );

    const contact = result.rows[0];

    logger.info('Emergency contact created', {
      contactId: contact.id,
      householdId,
      userId
    });

    res.status(201).json({
      success: true,
      message: 'Emergency contact created successfully',
      data: {
        id: contact.id,
        householdId: contact.household_id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        isPrimary: contact.is_primary,
        notes: contact.notes,
        createdAt: contact.created_at
      }
    });

  } catch (error) {
    logger.error('Create emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create emergency contact',
      error: error.message
    });
  }
};

// Update emergency contact
exports.updateEmergencyContact = async (req, res) => {
  try {
    const { householdId, contactId } = req.params;
    const { firstName, lastName, email, phone, relationship, isPrimary, notes } = req.body;
    const userId = req.user.userId;

    // Verify admin access
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update emergency contacts'
      });
    }

    // If setting as primary, remove primary flag from others
    if (isPrimary) {
      await execute(
        `UPDATE emergency_contacts SET is_primary = false WHERE household_id = $1 AND id != $2`,
        [householdId, contactId]
      );
    }

    // Update contact
    const result = await execute(
      `UPDATE emergency_contacts
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           relationship = COALESCE($5, relationship),
           is_primary = COALESCE($6, is_primary),
           notes = COALESCE($7, notes),
           updated_at = NOW()
       WHERE id = $8 AND household_id = $9
       RETURNING *`,
      [firstName, lastName, email, phone, relationship, isPrimary, notes, contactId, householdId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found'
      });
    }

    const contact = result.rows[0];

    logger.info('Emergency contact updated', {
      contactId,
      householdId,
      userId
    });

    res.json({
      success: true,
      message: 'Emergency contact updated successfully',
      data: {
        id: contact.id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        isPrimary: contact.is_primary,
        notes: contact.notes,
        updatedAt: contact.updated_at
      }
    });

  } catch (error) {
    logger.error('Update emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update emergency contact',
      error: error.message
    });
  }
};

// Delete emergency contact
exports.deleteEmergencyContact = async (req, res) => {
  try {
    const { householdId, contactId } = req.params;
    const userId = req.user.userId;

    // Verify admin access
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete emergency contacts'
      });
    }

    const result = await execute(
      `DELETE FROM emergency_contacts WHERE id = $1 AND household_id = $2`,
      [contactId, householdId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found'
      });
    }

    logger.info('Emergency contact deleted', {
      contactId,
      householdId,
      userId
    });

    res.json({
      success: true,
      message: 'Emergency contact deleted successfully'
    });

  } catch (error) {
    logger.error('Delete emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete emergency contact',
      error: error.message
    });
  }
};

// Grant permission to emergency contact
exports.grantPermission = async (req, res) => {
  try {
    const { householdId, contactId } = req.params;
    const { categoryId, canView, canDownload, expiresInHours } = req.body;
    const userId = req.user.userId;

    // Verify admin access
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can grant permissions'
      });
    }

    // Verify contact exists
    const contact = await getOne(
      `SELECT id, email FROM emergency_contacts WHERE id = $1 AND household_id = $2`,
      [contactId, householdId]
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found'
      });
    }

    // Calculate expiration
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : new Date(Date.now() + (parseInt(process.env.EMERGENCY_ACCESS_EXPIRY_HOURS) || 72) * 60 * 60 * 1000);

    // Check if permission already exists
    const existingPermission = await getOne(
      `SELECT id FROM emergency_contact_permissions WHERE contact_id = $1 AND category_id = $2`,
      [contactId, categoryId]
    );

    let result;
    if (existingPermission) {
      // Update existing permission
      result = await execute(
        `UPDATE emergency_contact_permissions
         SET can_view = $1, can_download = $2, expires_at = $3, granted_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [canView !== undefined ? canView : true, canDownload !== undefined ? canDownload : false, expiresAt, existingPermission.id]
      );
    } else {
      // Create new permission
      result = await execute(
        `INSERT INTO emergency_contact_permissions (contact_id, category_id, can_view, can_download, expires_at, granted_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [contactId, categoryId, canView !== undefined ? canView : true, canDownload !== undefined ? canDownload : false, expiresAt]
      );
    }

    const permission = result.rows[0];

    // Send notification
    try {
      const category = await getOne('SELECT name FROM document_categories WHERE id = $1', [categoryId]);
      const household = await getOne('SELECT name FROM households WHERE id = $1', [householdId]);

      await sendEmail({
        to: contact.email,
        subject: 'Emergency Document Access Granted',
        html: `
          <h1>Emergency Document Access</h1>
          <p>You have been granted ${canDownload ? 'download' : 'view'} access to ${category.name} documents for ${household.name}.</p>
          <p>This access will expire in ${expiresInHours || 72} hours.</p>
          <p>Access your documents at: ${process.env.API_URL}/emergency-access</p>
        `
      });
    } catch (emailError) {
      logger.error('Failed to send permission notification:', emailError);
    }

    logger.info('Emergency contact permission granted', {
      contactId,
      categoryId,
      householdId,
      userId
    });

    res.status(201).json({
      success: true,
      message: 'Permission granted successfully',
      data: {
        id: permission.id,
        contactId: permission.contact_id,
        categoryId: permission.category_id,
        canView: permission.can_view,
        canDownload: permission.can_download,
        expiresAt: permission.expires_at,
        grantedAt: permission.granted_at
      }
    });

  } catch (error) {
    logger.error('Grant permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to grant permission',
      error: error.message
    });
  }
};

// Revoke permission from emergency contact
exports.revokePermission = async (req, res) => {
  try {
    const { householdId, contactId, permissionId } = req.params;
    const userId = req.user.userId;

    // Verify admin access
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can revoke permissions'
      });
    }

    const result = await execute(
      `DELETE FROM emergency_contact_permissions
       WHERE id = $1 AND contact_id = $2`,
      [permissionId, contactId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Permission not found'
      });
    }

    logger.info('Emergency contact permission revoked', {
      permissionId,
      contactId,
      householdId,
      userId
    });

    res.json({
      success: true,
      message: 'Permission revoked successfully'
    });

  } catch (error) {
    logger.error('Revoke permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke permission',
      error: error.message
    });
  }
};

// Send emergency access link
exports.sendEmergencyAccess = async (req, res) => {
  try {
    const { householdId, contactId } = req.params;
    const { method } = req.body; // 'email' or 'sms'
    const userId = req.user.userId;

    // Verify admin access
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can send emergency access'
      });
    }

    // Get contact
    const contact = await getOne(
      `SELECT * FROM emergency_contacts WHERE id = $1 AND household_id = $2`,
      [contactId, householdId]
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found'
      });
    }

    // Generate access token
    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (parseInt(process.env.EMERGENCY_ACCESS_EXPIRY_HOURS) || 72) * 60 * 60 * 1000);

    // Store token
    await execute(
      `UPDATE emergency_contacts
       SET access_token = $1, access_token_expires = $2
       WHERE id = $3`,
      [accessToken, expiresAt, contactId]
    );

    const accessUrl = `${process.env.API_URL}/emergency-access/${accessToken}`;

    // Send via requested method
    if (method === 'email' && contact.email) {
      await sendEmail({
        to: contact.email,
        subject: 'Emergency Document Access Link',
        html: `
          <h1>Emergency Document Access</h1>
          <p>Hello ${contact.first_name},</p>
          <p>You have been granted emergency access to important documents. Click the link below to access them:</p>
          <a href="${accessUrl}">Access Emergency Documents</a>
          <p>This link will expire in 72 hours.</p>
        `
      });
    } else if (method === 'sms' && contact.phone) {
      await sendSMS({
        to: contact.phone,
        message: `Emergency document access: ${accessUrl} (expires in 72h)`
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid method or contact information missing'
      });
    }

    logger.info('Emergency access sent', {
      contactId,
      method,
      householdId,
      userId
    });

    res.json({
      success: true,
      message: `Emergency access link sent via ${method}`,
      data: {
        expiresAt
      }
    });

  } catch (error) {
    logger.error('Send emergency access error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send emergency access',
      error: error.message
    });
  }
};
