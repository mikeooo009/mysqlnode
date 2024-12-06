const express = require('express');
const WebSocket = require('ws');
const pool = require('./db');
const redisClient = require('./redis');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;



const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// Rate Limiting for API Requests
const apiLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 1 // 1 request per second per IP
});

app.use('/placeBid', apiLimiter);

// WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });
const auctions = new Map(); // Map to track auction rooms and their clients

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        const { action, payload } = data;

        if (action === 'joinAuction') {
            await handleJoinAuction(ws, payload);
        } else if (action === 'placeBid') {
            await handlePlaceBid(ws, payload);
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

// Handle placing a bid
const handlePlaceBid = async (ws, payload) => {
    const { userId, auctionId, bidAmount } = payload;
    console.log('Received placeBid request:', payload);

    try {
        // Begin Transaction
        const conn = await pool.getConnection();
        console.log('Connected to DB');
        await conn.beginTransaction();

        // Get Current Highest Bid
        let currentHighest = await redisClient.get(`auction_${auctionId}`);
        console.log('Current highest bid from Redis:', currentHighest);

        if (!currentHighest) {
            const [rows] = await conn.query(
                'SELECT MAX(bid_amount) AS highest FROM Bids WHERE auction_id = ?',
                [auctionId]
            );
            currentHighest = rows[0].highest || 0;
            console.log('Current highest bid from DB:', currentHighest);
            await redisClient.set(`auction_${auctionId}`, currentHighest);
        }

        if (bidAmount <= currentHighest) {
            ws.send(JSON.stringify({ error: 'Bid too low' }));
            conn.release();
            return;
        }

        // Insert Bid into Database
        await conn.query(
            'INSERT INTO Bids (user_id, auction_id, bid_amount) VALUES (?, ?, ?)',
            [userId, auctionId, bidAmount]
        );
        console.log('Bid inserted into DB');

        // Update Redis Cache
        await redisClient.set(`auction_${auctionId}`, bidAmount);

        // Commit Transaction
        await conn.commit();
        conn.release();

        // Broadcast to Auction Room
        const clients = auctions.get(auctionId) || [];
        clients.forEach((client) =>
            client.send(
                JSON.stringify({ message: `New bid: ${bidAmount}`, auctionId })
            )
        );
    } catch (err) {
        console.error('Error processing bid:', err);
        ws.send(JSON.stringify({ error: 'Failed to place bid' }));
    }
};

// Handle auction end
const handleAuctionEnd = async (ws, payload) => {
    const { auctionId } = payload;

    try {
        const highestBid = await redisClient.get(`auction_${auctionId}`);
        const clients = auctions.get(auctionId) || [];
        clients.forEach((client) =>
            client.send(
                JSON.stringify({ message: `Auction ended. Winning bid: ${highestBid}` })
            )
        );
        auctions.delete(auctionId);
    } catch (err) {
        console.error('Error ending auction:', err);
        ws.send(JSON.stringify({ error: 'Failed to end auction' }));
    }
};

app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
