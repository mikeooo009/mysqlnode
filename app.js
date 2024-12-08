const express = require('express');
const WebSocket = require('ws');
const pool = require('./db'); // MySQL connection pool
const redisClient = require('./redis');
const rateLimit = require('express-rate-limit');
const handlePlaceBid2 = require('./handlePlaceBid'); // Adjust the path as needed

const cors = require('cors'); // Import cors
const app = express();
const PORT = 3000;

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
app.use(cors());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(express.json()); // For parsing JSON request bodies
const bidQueues = new Map();
// Rate Limiting for API Requests
const apiLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 1, // 1 request per second per IP
});

app.use('/placeBid', rateLimit, apiLimiter);

// WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });
const auctions = new Map(); // Map to track auction rooms and their clients



const MAX_CONNECTIONS_PER_IP = 5; // example limit
const connectionCounts = new Map(); // key: ip, value: number of connections

const MESSAGE_LIMIT = 50; // max messages per IP per minute
const MESSAGE_WINDOW_MS = 60 * 1000;
const messageLogs = new Map(); // key: ip, value: array of timestamps


wss.on('connection', (ws, req) => {
    console.log('Client connected');
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Initialize if IP not seen before
    if (!connectionCounts.has(ip)) {
        connectionCounts.set(ip, 0);
    }

    // Increment connection count
    const currentCount = connectionCounts.get(ip) + 1;
    connectionCounts.set(ip, currentCount);

    // Check if limit exceeded
    if (currentCount > MAX_CONNECTIONS_PER_IP) {
        // Close the connection if too many
        ws.close(1013, 'Too many connections from your IP');
        return;
    }

    // Handle normal lifecycle
    console.log('Client connected:', ip);

    ws.on('close', () => {
        // Decrement connection count
        const count = connectionCounts.get(ip) - 1;
        connectionCounts.set(ip, Math.max(count, 0));
        console.log('Client disconnected:', ip);
    });

    ws.on('message', async (message) => {

        const now = Date.now();
        if (!messageLogs.has(ip)) {
            messageLogs.set(ip, []);
        }

        const timestamps = messageLogs.get(ip);
        // Remove timestamps older than the window
        while (timestamps.length && (now - timestamps[0]) > MESSAGE_WINDOW_MS) {
            timestamps.shift();
        }

        // Add current timestamp
        timestamps.push(now);

        // Check limit
        if (timestamps.length > MESSAGE_LIMIT) {
            // Too many messages
            console.warn(`Rate limit exceeded by IP: ${ip}`);
            // Optionally close the connection or send a warning message
            ws.send(JSON.stringify({ error: 'Rate limit exceeded' }));
            return;
        }

        // If passed rate limit checks, handle the message
        const data = JSON.parse(message);
        const { action, payload } = data;

        if (action === 'joinAuction') {
            await handleJoinAuction(ws, payload);
        } else if (action === 'placeBid') {
            await handlePlaceBid2(ws, payload, pool, redisClient, auctions, bidQueues);
        } else if (action === 'auctionEnd') {
            await handleAuctionEnd(ws, payload);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});







// Handle joining an auction room
const handleJoinAuction = async (ws, payload) => {
    const { auctionId } = payload;

    if (!auctions.has(auctionId)) {
        auctions.set(auctionId, []);
    }
    auctions.get(auctionId).push(ws);

    ws.send(JSON.stringify({ message: `Joined auction ${auctionId}` }));
};

const handlePlaceBid = async (ws, payload) => {
    let { userId, auctionId, bidAmount } = payload;
    userId = userId || 1;

    console.log('Received placeBid request:', payload);


    const conn = await pool.getConnection(false).getConnection();
    try {
        await conn.beginTransaction();

        // Step 1: Lock the auction row to prevent race conditions.
        // This ensures only one transaction can update the highest bid at a time.
        const [auctionRows] = await conn.query(
            'SELECT current_highest_bid FROM Auctions WHERE id = ? FOR UPDATE',
            [auctionId]
        );

        if (auctionRows.length === 0) {
            throw new Error('Auction not found');
        }

        let currentHighest = auctionRows[0].current_highest_bid || 0;
        console.log('Locked current highest bid from Auctions table:', currentHighest);

        // Validate the new bid against the locked current highest
        if (bidAmount <= currentHighest) {
            // Bid is too low, send error and rollback
            ws.send(JSON.stringify({ error: 'Bid too low' }));
            await conn.rollback();
            conn.release();
            return;
        }

        // Insert new bid
        const [insertResult] = await conn.query(
            'INSERT INTO Bids (user_id, auction_id, bid_amount) VALUES (?, ?, ?)',
            [userId, auctionId, bidAmount]
        );
        console.log('Bid inserted into DB:', insertResult);

        // Update the Auctions table with the new highest bid
        const [updateResult] = await conn.query(
            'UPDATE Auctions SET current_highest_bid = ? WHERE id = ?',
            [bidAmount, auctionId]
        );
        console.log('Auction current_highest_bid updated:', updateResult);

        // Update Redis cache (outside the locked context is generally safe, but still within the transaction)
        await redisClient.set(`auction_${auctionId}`, bidAmount);

        // Commit transaction
        await conn.commit();
        console.log('Transaction committed');
        conn.release();

        // Notify connected clients
        const clients = auctions.get(auctionId) || [];
        clients.forEach((client) =>
            client.send(JSON.stringify({ message: `New bid: ${bidAmount}`, auctionId }))
        );

    } catch (err) {
        console.error('Error processing bid:', err);
        try {
            await conn.rollback();
        } catch (rollbackErr) {
            console.error('Error rolling back transaction:', rollbackErr);
        }
        conn.release();
        ws.send(JSON.stringify({ error: 'Failed to place bid' }));
    }
};






// Route to add a new auction
app.post('/addAuction', async (req, res) => {
    const { name, start_time, end_time, car_id } = req.body;

    // Log the incoming request body to debug
    console.log('Received data:', req.body);

    // Validate the input fields
    if (!name || !start_time || !end_time || !car_id) {
        return res.status(400).send({ error: 'All fields are required.' });
    }

    const conn = await pool.getConnection(true).getConnection(); // Get connection from pool
    try {
        console.log('Connected to DB');

        await conn.beginTransaction(); // Start a transaction

        const query = 'INSERT INTO Auctions (name, start_time, end_time, car_id) VALUES (?, ?, ?, ?)';
        console.log('Executing query:', query, [name, start_time, end_time, car_id]);

        // Execute the insert query
        const [result] = await conn.query(query, [name, start_time, end_time, car_id]);
        console.log('Query result:', result);

        await conn.commit(); // Commit the transaction
        res.send({ message: 'Auction added successfully!' });

    } catch (err) {
        console.error('Error during transaction:', err);
        await conn.rollback(); // Rollback if there's an error
        res.status(500).send({ error: 'Failed to add auction.' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
});

// Route to add a new bid
app.post('/addBid', async (req, res) => {
    const { auction_id, bid_amount, user_id } = req.body;

    // Validate the input fields
    if (!auction_id || !bid_amount || !user_id) {
        return res.status(400).send({ error: 'All fields are required.' });
    }

    const conn = await pool.getConnection(true).getConnection(); // Get connection from pool
    try {
        console.log('Connected to DB');

        await conn.beginTransaction(); // Start a transaction

        const timestamp = new Date().toISOString();  // Automatically set the current timestamp
        const query = 'INSERT INTO Bids (auction_id, bid_amount, user_id, timestamp) VALUES (?, ?, ?, ?)';
        console.log('Executing query:', query, [auction_id, bid_amount, user_id, timestamp]);

        // Execute the insert query
        const [result] = await conn.query(query, [auction_id, bid_amount, user_id, timestamp]);
        console.log('Query result:', result);

        await conn.commit(); // Commit the transaction
        res.send({ message: 'Bid added successfully!' });

    } catch (err) {
        console.error('Error during transaction:', err);
        await conn.rollback(); // Rollback if there's an error
        res.status(500).send({ error: 'Failed to add bid.' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
});


// Handle auction end
// const handleAuctionEnd = async (ws, payload) => {
//     const { auctionId } = payload;

//     try {
//         const highestBid = await redisClient.get(`auction_${auctionId}`);
//         const clients = auctions.get(auctionId) || [];
//         clients.forEach((client) =>
//             client.send(
//                 JSON.stringify({ message: `Auction ended. Winning bid: ${highestBid}` })
//             )
//         );
//         auctions.delete(auctionId);
//     } catch (err) {
//         console.error('Error ending auction:', err);
//         ws.send(JSON.stringify({ error: 'Failed to end auction' }));
//     }
// };

// Fetch all bids and related car information
app.get('/bids', async (req, res) => {
    try {
        const conn = await pool.getConnection(true).getConnection();
        console.log('Connected to DB for fetching bids');

        const sql = `
        SELECT 
            Auctions.id AS auction_id,
            Auctions.name AS auction_name,
            Auctions.start_time AS auction_start,
            Auctions.end_time AS auction_end,
            Bids.id AS bid_id,
            Bids.user_id AS bidder_id,
            Bids.bid_amount,
            Bids.timestamp AS bid_time
        FROM Auctions
        LEFT JOIN Bids ON Auctions.id = Bids.auction_id
        ORDER BY Auctions.id, Bids.bid_amount DESC;
        `;



        const [rows] = await conn.query(sql);
        conn.release();

        res.status(200).json(rows);
    } catch (err) {
        console.error('Error fetching bids:', err);
        res.status(500).json({ error: 'Failed to fetch bids' });
    }
});


app.use(express.urlencoded({ extended: true }));


app.post('/addCar', async (req, res) => {
    console.log('Request Body:', req.body); // Log request body
    const { name, image, startingBid, auctionEnd } = req.body;

    // Print all the values
    console.log("Name: req.body ", req.bodyname);
    console.log("Name:", name);
    console.log("Image URL:", image);
    console.log("Starting Bid:", startingBid);
    console.log("Auction End Date/Time:", auctionEnd);


    if (!name || !image || !startingBid || !auctionEnd) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const conn = await pool.getConnection(true).getConnection();
        console.log('Connected to Database');
        const sql = `
            INSERT INTO Cars (name, image, starting_bid, auction_end)
            VALUES (?, ?, ?, ?)
        `;
        await conn.query(sql, [name, image, startingBid, auctionEnd]);
        conn.release();

        console.log('Car added successfully:', { name, image, startingBid, auctionEnd });
        res.status(201).json({ message: 'Car added successfully.' });
    } catch (err) {
        console.error('Error adding car:', err);
        res.status(500).json({ error: 'Failed to add car.' });
    }
});

app.use(cors({
    origin: 'http://localhost'  // Allow only this origin
}));

app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
