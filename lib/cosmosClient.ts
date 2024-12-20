import { CosmosClient } from "@azure/cosmos";
// import dotenv from "dotenv";

// Load environment variables from .env.local file
// dotenv.config();

// Use environment variables to connect to Cosmos DB
const endpoint = process.env.COSMOS_DB_ENDPOINT!;
const key = process.env.COSMOS_DB_KEY!;
const databaseId = process.env.COSMOS_DB_DATABASE!;

console.log("endpoint: ", endpoint);
console.log("key: ", key);
console.log("databaseId: ", databaseId);

// if (!endpoint) {
//   throw new Error("COSMOS_DB_ENDPOINT environment variable is missing");
// }

// if (!key) {
//   throw new Error("COSMOS_DB_KEY environment variable is missing");
// }

// if (!databaseId) {
//   throw new Error("COSMOS_DB_DATABASE environment variable is missing");
// }

// Initialize Cosmos DB client
const client = new CosmosClient({ endpoint, key });

console.log("client: ", client);

// Reference the Cosmos DB database
const database = client.database(databaseId);

console.log("database: ", database);

export default database;
