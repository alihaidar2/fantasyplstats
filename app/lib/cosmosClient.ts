import { CosmosClient } from "@azure/cosmos";
import dotenv from "dotenv";

// Load environment variables from .env.local file
dotenv.config();
console.log("in cosmos client");

// Use environment variables to connect to Cosmos DB
const endpoint = process.env.COSMOS_DB_ENDPOINT!;
const key = process.env.COSMOS_DB_KEY!;
if (!endpoint || !key) {
  console.error("Missing Cosmos DB endpoint or key environment variables");
}
console.log("COSMOS_DB_ENDPOINT:", process.env.COSMOS_DB_ENDPOINT);
console.log(
  "COSMOS_DB_KEY:",
  process.env.COSMOS_DB_KEY ? "Key is present" : "Key is missing"
);

const databaseId = process.env.COSMOS_DB_DATABASE!;

// Initialize Cosmos DB client
const client = new CosmosClient({ endpoint, key });

console.log("client: ", client);

// Reference the Cosmos DB database
const database = client.database(databaseId);

console.log("database: ", database);

export default database;
