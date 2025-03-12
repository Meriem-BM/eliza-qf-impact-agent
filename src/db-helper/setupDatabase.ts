import pkg from "pg";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

// Define database type
type DatabaseClient = {
  query: (text: string, params?: any[]) => Promise<any>;
  close: () => Promise<void>;
};

// Root directory setup
const ROOT_DIR = path.resolve();
const DATA_DIR = path.join(ROOT_DIR, "data");

// Initialize database connection
export function createDatabaseConnection(): DatabaseClient {
  if (process.env.POSTGRES_URL) {
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

    return {
      query: async (text, params = []) => {
        const client = await pool.connect();
        try {
          const res = await client.query(text, params);
          return res.rows;
        } finally {
          client.release();
        }
      },
      close: async () => {
        await pool.end();
      },
    };
  } else {

    // Ensure the "data" directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const dbPath =
      process.env.SQLITE_FILE || path.join(DATA_DIR, "database.sqlite");
    const db = new Database(dbPath);

    return {
      query: async (text, params = []) => {
        // ✅ Convert PostgreSQL-style `$1, $2, $3` to SQLite `?`
        const sqliteQuery = text.replace(/\$\d+/g, "?");

        const stmt = db.prepare(sqliteQuery);
        const isSelect = sqliteQuery.trim().toUpperCase().startsWith("SELECT");

        if (isSelect) {
          return params.length > 0 ? stmt.all(params) : stmt.all();
        } else {
          return params.length > 0 ? stmt.run(params) : stmt.run();
        }
      },
      close: async () => {
        db.close();
      },
    };
  }
}

// Create necessary tables if they don't exist
export async function setupDatabase() {
  const db = createDatabaseConnection();

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS processed_responses (
      response_id TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await db.query(createTableQuery, []);
    console.log(
      `✅ Database (${process.env.POSTGRES_URL ? "PostgreSQL" : "SQLite"}) setup successful!`
    );
  } catch (error) {
    console.error("❌ Error setting up database:", error);
  } finally {
    await db.close();
  }
}
