const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DISK_PATH ? path.join(process.env.DISK_PATH, 'app.db') : './app.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('SQLite error:', err);
  else console.log('SQLite connected');
});

// Init tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS Agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      name TEXT,
      prompt_script TEXT,
      dial_limit INTEGER,
      max_calls_per_contact INTEGER,
      call_time_start INTEGER,
      call_time_end INTEGER,
      call_days TEXT,  -- JSON string of array
      double_dial_no_answer BOOLEAN,
      active BOOLEAN DEFAULT 0,
      integrationId TEXT,
      voice_id TEXT,
      createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      modifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS CallLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      botId TEXT,
      call_date DATETIME,
      call_duration INTEGER,
      call_outcome TEXT,
      category_label TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      lead_source TEXT,
      notes TEXT,
      recording TEXT,
      createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      modifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS DashboardStats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      botId TEXT,
      appointments_set TEXT,
      conversation_count INTEGER,
      date TEXT,
      dials_count INTEGER,
      createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      modifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS Integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      api_key TEXT,  -- Hashed
      integration_type TEXT,
      last_tested DATETIME,
      test_status TEXT,
      creds TEXT,  -- JSON string of additional creds
      createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      modifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add voice_id column if not exists
  db.get("PRAGMA table_info(Agents)", (err, rows) => {
    if (err) return console.error(err);
    const hasVoiceId = rows.some(row => row.name === 'voice_id');
    if (!hasVoiceId) {
      db.run("ALTER TABLE Agents ADD COLUMN voice_id TEXT", (err) => {
        if (err) console.error('Error adding voice_id column:', err);
        else console.log('Added voice_id column to Agents table');
      });
    }
  });
});

module.exports = db;
