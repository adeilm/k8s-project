const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL || "postgres://todo:todo@postgres:5432/todoapp";

const pool = new Pool({ connectionString });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

module.exports = {
  initDb,
  query: (text, params) => pool.query(text, params),
  end: () => pool.end(),
};
