import { CosmosClient, Database } from "@azure/cosmos";
import dotenv from "dotenv";

// Load environment variables from .env.local file
dotenv.config();

// Use environment variables to connect to Cosmos DB
const endpoint = process.env.COSMOS_DB_ENDPOINT!;
const key = process.env.COSMOS_DB_KEY!;

// Check for required environment variables
if (!endpoint || !key) {
  console.error("Missing Cosmos DB endpoint or key environment variables");
  console.log("COSMOS_DB_ENDPOINT:", endpoint || "undefined");
  console.log("COSMOS_DB_KEY:", key ? "Key is present" : "Key is missing");
}

const databaseId = process.env.COSMOS_DB_DATABASE!;

// Initialize Cosmos DB client only if environment variables are defined
const client = endpoint && key ? new CosmosClient({ endpoint, key }) : null;

// Reference the database only if the client is initialized
const database: Database | null = client ? client.database(databaseId) : null;

if (database) {
  console.log("Cosmos DB database initialized:", databaseId);
} else {
  console.warn("Cosmos DB database not initialized due to missing variables");
}

export default database;
