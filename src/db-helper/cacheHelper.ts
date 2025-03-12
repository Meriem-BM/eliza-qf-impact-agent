import { createDatabaseConnection } from "./setupDatabase.ts";

export async function isResponseProcessed(
  responseId: string
): Promise<boolean> {
  const db = createDatabaseConnection();

  try {
    const isPostgres = !!process.env.POSTGRES_URL;
    const queryText = isPostgres
      ? "SELECT COUNT(*) FROM processed_responses WHERE response_id = $1"
      : "SELECT COUNT(*) as count FROM processed_responses WHERE response_id = ?";
    const params = [responseId];
    const result = await db.query(queryText, params);

    await db.close();

    // ✅ Normalize the response structure for both DBs
    return result[0]?.count != 0;
  } catch (error) {
    console.error("❌ Database query error:", error);
    return false;
  }
}

// ✅ Store response_id after processing
export async function markResponseAsProcessed(
  responseId: string
): Promise<void> {
  const db = createDatabaseConnection();

  try {
    const isPostgres = !!process.env.POSTGRES_URL;
    const queryText = isPostgres
      ? "INSERT INTO processed_responses (response_id, created_at) VALUES ($1, NOW())"
      : "INSERT INTO processed_responses (response_id, created_at) VALUES (?, CURRENT_TIMESTAMP)";

    const params = [responseId];

    await db.query(queryText, params);
  } catch (error) {
    console.error("❌ Error marking response as processed:", error);
  } finally {
    await db.close();
  }
}
