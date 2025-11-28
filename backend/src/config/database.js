const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'effak',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // How long to wait for a connection
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false
};

// Create connection pool
const pool = new Pool(config);

// Handle pool errors
pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle database client', err);
});

// Handle pool connection
pool.on('connect', (client) => {
  logger.debug('New database client connected');
});

// Handle pool removal
pool.on('remove', (client) => {
  logger.debug('Database client removed from pool');
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection established successfully', {
      timestamp: result.rows[0].now
    });
    return true;
  } catch (error) {
    logger.error('Failed to connect to database:', {
      error: error.message,
      host: config.host,
      database: config.database
    });
    return false;
  }
};

// Execute a query with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', {
      text: text.substring(0, 100),
      duration,
      rows: result.rowCount
    });
    return result;
  } catch (error) {
    logger.error('Query error:', {
      error: error.message,
      query: text.substring(0, 100),
      params
    });
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Helper function to safely get a single row
const getOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

// Helper function to get multiple rows
const getMany = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

// Helper function for INSERT/UPDATE/DELETE operations
const execute = async (text, params) => {
  const result = await query(text, params);
  return {
    rowCount: result.rowCount,
    rows: result.rows
  };
};

module.exports = {
  pool,
  query,
  getOne,
  getMany,
  execute,
  transaction,
  testConnection
};
