require('dotenv').config();
const { Pool } = require('pg');

// Create a new pool for migrations
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'effak',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false
});

const runMigration = async () => {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');

    // Start transaction
    await client.query('BEGIN');

    // 1. Users table
    console.log('Creating users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        email_verified BOOLEAN DEFAULT false,
        email_verification_token VARCHAR(255),
        email_verification_expires TIMESTAMP,
        password_reset_token VARCHAR(255),
        password_reset_expires TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for users
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
      CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);
    `);

    // 2. Households table
    console.log('Creating households table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_households_created_by ON households(created_by);
    `);

    // 3. Household members table
    console.log('Creating household_members table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS household_members (
        id SERIAL PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
        relationship VARCHAR(50),
        is_primary BOOLEAN DEFAULT false,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(household_id, user_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);
      CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
    `);

    // 4. Document categories table
    console.log('Creating document_categories table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        color VARCHAR(20),
        sort_order INTEGER DEFAULT 0,
        is_system BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default categories
    console.log('Inserting default document categories...');
    await client.query(`
      INSERT INTO document_categories (name, description, icon, color, sort_order, is_system)
      VALUES
        ('Personal ID', 'Driver''s license, passport, birth certificate', 'id-card', 'blue', 1, true),
        ('Financial', 'Bank accounts, credit cards, investment accounts', 'dollar-sign', 'green', 2, true),
        ('Insurance', 'Health, life, auto, home insurance policies', 'shield', 'purple', 3, true),
        ('Medical', 'Medical records, prescriptions, health directives', 'heart', 'red', 4, true),
        ('Legal', 'Wills, trusts, power of attorney', 'gavel', 'brown', 5, true),
        ('Property', 'Deeds, titles, rental agreements', 'home', 'orange', 6, true),
        ('Tax', 'Tax returns, W2s, 1099s', 'file-text', 'yellow', 7, true),
        ('Emergency Contacts', 'Important contact information', 'phone', 'teal', 8, true),
        ('Other', 'Miscellaneous important documents', 'file', 'gray', 9, true)
      ON CONFLICT DO NOTHING
    `);

    // 5. Documents table
    console.log('Creating documents table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        household_member_id INTEGER REFERENCES household_members(id) ON DELETE SET NULL,
        category_id INTEGER NOT NULL REFERENCES document_categories(id) ON DELETE RESTRICT,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INTEGER,
        file_type VARCHAR(100),
        is_encrypted BOOLEAN DEFAULT false,
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_household ON documents(household_id);
      CREATE INDEX IF NOT EXISTS idx_documents_member ON documents(household_member_id);
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);
      CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
    `);

    // 6. Emergency contacts table
    console.log('Creating emergency_contacts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id SERIAL PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        relationship VARCHAR(100),
        is_primary BOOLEAN DEFAULT false,
        notes TEXT,
        access_token VARCHAR(255),
        access_token_expires TIMESTAMP,
        added_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emergency_contacts_household ON emergency_contacts(household_id);
      CREATE INDEX IF NOT EXISTS idx_emergency_contacts_access_token ON emergency_contacts(access_token);
    `);

    // 7. Emergency contact permissions table
    console.log('Creating emergency_contact_permissions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_contact_permissions (
        id SERIAL PRIMARY KEY,
        contact_id INTEGER NOT NULL REFERENCES emergency_contacts(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES document_categories(id) ON DELETE CASCADE,
        can_view BOOLEAN DEFAULT true,
        can_download BOOLEAN DEFAULT false,
        expires_at TIMESTAMP,
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(contact_id, category_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emergency_permissions_contact ON emergency_contact_permissions(contact_id);
      CREATE INDEX IF NOT EXISTS idx_emergency_permissions_category ON emergency_contact_permissions(category_id);
    `);

    // 8. Emergency access logs table
    console.log('Creating emergency_access_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_access_logs (
        id SERIAL PRIMARY KEY,
        contact_id INTEGER NOT NULL REFERENCES emergency_contacts(id) ON DELETE CASCADE,
        document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_logs_contact ON emergency_access_logs(contact_id);
      CREATE INDEX IF NOT EXISTS idx_access_logs_document ON emergency_access_logs(document_id);
      CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON emergency_access_logs(accessed_at);
    `);

    // 9. Document shares table
    console.log('Creating document_shares table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_shares (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        shared_with INTEGER REFERENCES users(id) ON DELETE CASCADE,
        shared_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        can_edit BOOLEAN DEFAULT false,
        can_delete BOOLEAN DEFAULT false,
        expires_at TIMESTAMP,
        shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_shares_document ON document_shares(document_id);
      CREATE INDEX IF NOT EXISTS idx_document_shares_shared_with ON document_shares(shared_with);
    `);

    // 10. Activity logs table
    console.log('Creating activity_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        details JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_household ON activity_logs(household_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
    `);

    // 11. Notifications table
    console.log('Creating notifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(500),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    `);

    // 12. Sessions table (optional, for session management)
    console.log('Creating sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) NOT NULL,
        refresh_token VARCHAR(500),
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `);

    // Create trigger function for updated_at timestamps
    console.log('Creating trigger functions...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Add triggers to tables with updated_at column
    const tablesWithUpdatedAt = [
      'users',
      'households',
      'household_members',
      'document_categories',
      'documents',
      'emergency_contacts'
    ];

    for (const table of tablesWithUpdatedAt) {
      await client.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      `);
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n✅ Database migration completed successfully!');
    console.log('\nCreated tables:');
    console.log('  1. users');
    console.log('  2. households');
    console.log('  3. household_members');
    console.log('  4. document_categories');
    console.log('  5. documents');
    console.log('  6. emergency_contacts');
    console.log('  7. emergency_contact_permissions');
    console.log('  8. emergency_access_logs');
    console.log('  9. document_shares');
    console.log('  10. activity_logs');
    console.log('  11. notifications');
    console.log('  12. sessions');
    console.log('\nDatabase is ready for use!\n');

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);

  } finally {
    client.release();
    await pool.end();
  }
};

// Run migration
runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
