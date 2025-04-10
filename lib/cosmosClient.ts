import { CosmosClient, Database } from "@azure/cosmos";

let cachedDatabase: Database | null = null;

export function getDatabase(): Database | null {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE;

  if (!endpoint || !key || !databaseId) {
    console.error("❌ Missing Cosmos DB environment variables:");
    console.log("COSMOS_DB_ENDPOINT:", endpoint || "undefined");
    console.log("COSMOS_DB_KEY is set:", !!key);
    console.log("COSMOS_DB_DATABASE:", databaseId || "undefined");
    return null;
  }

  if (!cachedDatabase) {
    const client = new CosmosClient({ endpoint, key });
    cachedDatabase = client.database(databaseId);
    console.log("✅ Cosmos DB database initialized:", databaseId);
  }

  return cachedDatabase;
}
