const { query, getOne, getMany, execute, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/email');
const crypto = require('crypto');

// Get all households for current user
exports.getHouseholds = async (req, res) => {
  try {
    const userId = req.user.userId;

    const households = await getMany(
      `SELECT h.id, h.name, h.created_by, h.created_at, h.updated_at,
              hm.role, hm.is_primary,
              u.first_name as creator_first_name, u.last_name as creator_last_name
       FROM households h
       INNER JOIN household_members hm ON h.id = hm.household_id
       INNER JOIN users u ON h.created_by = u.id
       WHERE hm.user_id = $1
       ORDER BY hm.is_primary DESC, h.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: households.map(h => ({
        id: h.id,
        name: h.name,
        role: h.role,
        isPrimary: h.is_primary,
        createdBy: {
          id: h.created_by,
          name: `${h.creator_first_name} ${h.creator_last_name}`
        },
        createdAt: h.created_at,
        updatedAt: h.updated_at
      }))
    });

  } catch (error) {
    logger.error('Get households error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch households',
      error: error.message
    });
  }
};

// Get household by ID
exports.getHouseholdById = async (req, res) => {
  try {
    const { householdId } = req.params;
    const userId = req.user.userId;

    // Check if user has access to this household
    const membership = await getOne(
      `SELECT hm.role, hm.is_primary
       FROM household_members hm
       WHERE hm.household_id = $1 AND hm.user_id = $2`,
      [householdId, userId]
    );

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this household'
      });
    }

    // Get household details
    const household = await getOne(
      `SELECT h.id, h.name, h.created_by, h.created_at, h.updated_at,
              u.first_name, u.last_name, u.email
       FROM households h
       INNER JOIN users u ON h.created_by = u.id
       WHERE h.id = $1`,
      [householdId]
    );

    // Get all members
    const members = await getMany(
      `SELECT hm.id, hm.user_id, hm.role, hm.relationship, hm.is_primary, hm.joined_at,
              u.first_name, u.last_name, u.email, u.phone
       FROM household_members hm
       INNER JOIN users u ON hm.user_id = u.id
       WHERE hm.household_id = $1
       ORDER BY hm.is_primary DESC, hm.joined_at ASC`,
      [householdId]
    );

    res.json({
      success: true,
      data: {
        id: household.id,
        name: household.name,
        createdBy: {
          id: household.created_by,
          firstName: household.first_name,
          lastName: household.last_name,
          email: household.email
        },
        yourRole: membership.role,
        isPrimary: membership.is_primary,
        members: members.map(m => ({
          id: m.id,
          userId: m.user_id,
          firstName: m.first_name,
          lastName: m.last_name,
          email: m.email,
          phone: m.phone,
          role: m.role,
          relationship: m.relationship,
          isPrimary: m.is_primary,
          joinedAt: m.joined_at
        })),
        createdAt: household.created_at,
        updatedAt: household.updated_at
      }
    });

  } catch (error) {
    logger.error('Get household error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch household',
      error: error.message
    });
  }
};

// Create new household
exports.createHousehold = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.userId;

    const result = await transaction(async (client) => {
      // Create household
      const householdResult = await client.query(
        `INSERT INTO households (name, created_by, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id, name, created_by, created_at`,
        [name, userId]
      );

      const household = householdResult.rows[0];

      // Add creator as admin member
      await client.query(
        `INSERT INTO household_members (household_id, user_id, role, relationship, is_primary, joined_at)
         VALUES ($1, $2, 'admin', 'self', false, NOW())`,
        [household.id, userId]
      );

      return household;
    });

    logger.info('Household created', {
      householdId: result.id,
      userId
    });

    res.status(201).json({
      success: true,
      message: 'Household created successfully',
      data: {
        id: result.id,
        name: result.name,
        createdBy: result.created_by,
        createdAt: result.created_at
      }
    });

  } catch (error) {
    logger.error('Create household error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create household',
      error: error.message
    });
  }
};

// Update household
exports.updateHousehold = async (req, res) => {
  try {
    const { householdId } = req.params;
    const { name } = req.body;
    const userId = req.user.userId;

    // Check if user is admin
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
        message: 'Only admins can update household details'
      });
    }

    const result = await execute(
      `UPDATE households
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, updated_at`,
      [name, householdId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Household not found'
      });
    }

    logger.info('Household updated', { householdId, userId });

    res.json({
      success: true,
      message: 'Household updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Update household error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update household',
      error: error.message
    });
  }
};

// Delete household
exports.deleteHousehold = async (req, res) => {
  try {
    const { householdId } = req.params;
    const userId = req.user.userId;

    // Check if user is the creator
    const household = await getOne(
      'SELECT created_by FROM households WHERE id = $1',
      [householdId]
    );

    if (!household) {
      return res.status(404).json({
        success: false,
        message: 'Household not found'
      });
    }

    if (household.created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the household creator can delete it'
      });
    }

    // Delete household (cascade will handle related records)
    await execute('DELETE FROM households WHERE id = $1', [householdId]);

    logger.info('Household deleted', { householdId, userId });

    res.json({
      success: true,
      message: 'Household deleted successfully'
    });

  } catch (error) {
    logger.error('Delete household error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete household',
      error: error.message
    });
  }
};

// Add member to household
exports.addMember = async (req, res) => {
  try {
    const { householdId } = req.params;
    const { email, role, relationship } = req.body;
    const userId = req.user.userId;

    // Check if user is admin
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add members'
      });
    }

    // Find user to add
    const userToAdd = await getOne(
      'SELECT id, first_name, last_name, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }

    // Check if already a member
    const existingMember = await getOne(
      'SELECT id FROM household_members WHERE household_id = $1 AND user_id = $2',
      [householdId, userToAdd.id]
    );

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this household'
      });
    }

    // Add member
    const result = await execute(
      `INSERT INTO household_members (household_id, user_id, role, relationship, is_primary, joined_at)
       VALUES ($1, $2, $3, $4, false, NOW())
       RETURNING id, user_id, role, relationship, joined_at`,
      [householdId, userToAdd.id, role || 'member', relationship || 'other']
    );

    const newMember = result.rows[0];

    // Send notification email
    try {
      const household = await getOne('SELECT name FROM households WHERE id = $1', [householdId]);
      const inviter = await getOne('SELECT first_name, last_name FROM users WHERE id = $1', [userId]);

      await sendEmail({
        to: userToAdd.email,
        subject: 'Added to EFFAK Household',
        html: `
          <h1>You've been added to a household</h1>
          <p>Hello ${userToAdd.first_name},</p>
          <p>${inviter.first_name} ${inviter.last_name} has added you to the household "${household.name}" on EFFAK.</p>
          <p>Your role: ${role || 'member'}</p>
          <p>You can now access and manage this household's emergency documents.</p>
        `
      });
    } catch (emailError) {
      logger.error('Failed to send member addition email:', emailError);
    }

    logger.info('Member added to household', {
      householdId,
      newMemberId: userToAdd.id,
      addedBy: userId
    });

    res.status(201).json({
      success: true,
      message: 'Member added successfully',
      data: {
        id: newMember.id,
        userId: userToAdd.id,
        firstName: userToAdd.first_name,
        lastName: userToAdd.last_name,
        email: userToAdd.email,
        role: newMember.role,
        relationship: newMember.relationship,
        joinedAt: newMember.joined_at
      }
    });

  } catch (error) {
    logger.error('Add member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add member',
      error: error.message
    });
  }
};

// Update member role
exports.updateMemberRole = async (req, res) => {
  try {
    const { householdId, memberId } = req.params;
    const { role, relationship } = req.body;
    const userId = req.user.userId;

    // Check if user is admin
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update member roles'
      });
    }

    // Update member
    const result = await execute(
      `UPDATE household_members
       SET role = COALESCE($1, role),
           relationship = COALESCE($2, relationship),
           updated_at = NOW()
       WHERE id = $3 AND household_id = $4
       RETURNING id, user_id, role, relationship`,
      [role, relationship, memberId, householdId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    logger.info('Member role updated', {
      householdId,
      memberId,
      updatedBy: userId
    });

    res.json({
      success: true,
      message: 'Member updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Update member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update member',
      error: error.message
    });
  }
};

// Remove member from household
exports.removeMember = async (req, res) => {
  try {
    const { householdId, memberId } = req.params;
    const userId = req.user.userId;

    // Check if user is admin
    const membership = await getOne(
      `SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove members'
      });
    }

    // Prevent removing primary member
    const memberToRemove = await getOne(
      `SELECT is_primary, user_id FROM household_members WHERE id = $1 AND household_id = $2`,
      [memberId, householdId]
    );

    if (!memberToRemove) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    if (memberToRemove.is_primary) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove primary household member'
      });
    }

    // Remove member
    await execute(
      'DELETE FROM household_members WHERE id = $1 AND household_id = $2',
      [memberId, householdId]
    );

    logger.info('Member removed from household', {
      householdId,
      memberId,
      removedBy: userId
    });

    res.json({
      success: true,
      message: 'Member removed successfully'
    });

  } catch (error) {
    logger.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove member',
      error: error.message
    });
  }
};

// Get household members with their document counts
exports.getHouseholdMembers = async (req, res) => {
  try {
    const { householdId } = req.params;
    const userId = req.user.userId;

    // Check access
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

    const members = await getMany(
      `SELECT hm.id, hm.user_id, hm.role, hm.relationship, hm.is_primary, hm.joined_at,
              u.first_name, u.last_name, u.email, u.phone,
              COUNT(DISTINCT d.id) as document_count
       FROM household_members hm
       INNER JOIN users u ON hm.user_id = u.id
       LEFT JOIN documents d ON d.household_member_id = hm.id
       WHERE hm.household_id = $1
       GROUP BY hm.id, hm.user_id, hm.role, hm.relationship, hm.is_primary, hm.joined_at,
                u.first_name, u.last_name, u.email, u.phone
       ORDER BY hm.is_primary DESC, hm.joined_at ASC`,
      [householdId]
    );

    res.json({
      success: true,
      data: members.map(m => ({
        id: m.id,
        userId: m.user_id,
        firstName: m.first_name,
        lastName: m.last_name,
        email: m.email,
        phone: m.phone,
        role: m.role,
        relationship: m.relationship,
        isPrimary: m.is_primary,
        documentCount: parseInt(m.document_count),
        joinedAt: m.joined_at
      }))
    });

  } catch (error) {
    logger.error('Get household members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch household members',
      error: error.message
    });
  }
};
