const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'sql12.freesqldatabase.com',
    user: 'sql12750346',
    password: 'GwhWuvSYrj',
    database: 'sql12750346',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    port: 3306
});



module.exports = pool;
