const { Pool } = require("pg");

const pool = new Pool({
 user: "nuevo",
 host: "localhost",
 database: "nutriedu",
 password: "1234",
 port: 5432,
});

module.exports = pool;