const { DataAPIClient } = require("@datastax/astra-db-ts");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.local" });

const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN);
const database = client.db(process.env.ASTRA_DB_URL);

module.exports = database;
