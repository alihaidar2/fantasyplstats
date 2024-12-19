import { CosmosClient } from "@azure/cosmos";
import dotenv from "dotenv";

// Load environment variables from .env.local file
dotenv.config();

// Use environment variables to connect to Cosmos DB
const endpoint = process.env.COSMOS_DB_ENDPOINT!;
const key = process.env.COSMOS_DB_KEY!;
const databaseId = process.env.COSMOS_DB_DATABASE!;

// Initialize Cosmos DB client
const client = new CosmosClient({ endpoint, key });

// Reference the Cosmos DB database
const database = client.database(databaseId);

export default database;
