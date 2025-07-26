// VB-v1.01-main/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const initTables = async () => {
  try {
    // Agents Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Agents (
        id SERIAL PRIMARY KEY,
        userId TEXT,
        name TEXT,
        prompt_script TEXT,
        dial_limit INTEGER,
        max_calls_per_contact INTEGER,
        call_time_start INTEGER,
        call_time_end INTEGER,
        call_days TEXT, -- JSON string of array
        double_dial_no_answer BOOLEAN,
        active BOOLEAN DEFAULT FALSE,
        integrationId TEXT,
        voice_id TEXT,
        minutes_used INTEGER DEFAULT 0,
        createdDate TIMESTAMP DEFAULT NOW(),
        modifiedDate TIMESTAMP DEFAULT NOW()
      );
    `);

    // CallAttempts Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS CallAttempts (
        id SERIAL PRIMARY KEY,
        agentId INTEGER NOT NULL REFERENCES Agents(id),
        leadPhone TEXT NOT NULL,
        attemptCount INTEGER DEFAULT 0,
        lastAttemptTime TIMESTAMP,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        createdDate TIMESTAMP DEFAULT NOW(),
        modifiedDate TIMESTAMP DEFAULT NOW()
      );
    `);

    // CallLogs Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS CallLogs (
        id SERIAL PRIMARY KEY,
        botId TEXT,
        call_date TIMESTAMP,
        call_duration INTEGER,
        call_outcome TEXT,
        category_label TEXT,
        contact_name TEXT,
        contact_phone TEXT,
        lead_source TEXT,
        notes TEXT,
        recording TEXT,
        createdDate TIMESTAMP DEFAULT NOW(),
        modifiedDate TIMESTAMP DEFAULT NOW()
      );
    `);

    // DashboardStats Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS DashboardStats (
        id SERIAL PRIMARY KEY,
        botId TEXT,
        appointments_set TEXT,
        conversation_count INTEGER,
        date TEXT,
        dials_count INTEGER,
        createdDate TIMESTAMP DEFAULT NOW(),
        modifiedDate TIMESTAMP DEFAULT NOW()
      );
    `);

    // Integrations Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Integrations (
        id SERIAL PRIMARY KEY,
        userId TEXT,
        api_key TEXT,
        integration_type TEXT,
        last_tested TIMESTAMP,
        test_status TEXT,
        creds TEXT,
        createdDate TIMESTAMP DEFAULT NOW(),
        modifiedDate TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ PostgreSQL connected and all tables initialized');
  } catch (err) {
    console.error('❌ Error initializing PostgreSQL tables:', err);
  }
};

initTables();

// Export for use in project
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};



module.exports = db;

