const express = require('express');
const WebSocket = require('ws');
const pool = require('./db'); // MySQL connection pool
const redisClient = require('./redis');
const rateLimit = require('express-rate-limit');
const mysql = require('mysql2/promise'); // For database operations
const Redis = require('ioredis');       // For Redis operations
const cors = require('cors'); // Import cors
const app = express();
const PORT = 3000;
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');



const handlePlaceBid = async (ws, payload, pool, redisClient, auctions, bidQueues) => {
    let { userId, auctionId, bidAmount } = payload;
    userId = userId || 1;

    console.log('Received placeBid request:', payload);

    // Ensure a queue exists for the auction
    if (!bidQueues.has(auctionId)) {
        bidQueues.set(auctionId, []);
    }

    const queue = bidQueues.get(auctionId);

    // Add the bid to the queue
    queue.push(async () => {
        const conn = await pool.getConnection(false).getConnection();
        try {
            await conn.beginTransaction();

            // Step 1: Lock the auction row to prevent race conditions.
            const [auctionRows] = await conn.query(
                'SELECT current_highest_bid FROM Auctions WHERE id = ? FOR UPDATE',
                [auctionId]
            );

            if (auctionRows.length === 0) {
                throw new Error('Auction not found');
            }

            let currentHighest = auctionRows[0].current_highest_bid || 0;
            console.log('Locked current highest bid from Auctions table:', currentHighest);

            if (bidAmount <= currentHighest) {
                ws.send(JSON.stringify({ error: 'Bid too low' }));
                await conn.rollback();
                conn.release();
                return;
            }

            const [insertResult] = await conn.query(
                'INSERT INTO Bids (user_id, auction_id, bid_amount) VALUES (?, ?, ?)',
                [userId, auctionId, bidAmount]
            );
            console.log('Bid inserted into DB:', insertResult);

            const [updateResult] = await conn.query(
                'UPDATE Auctions SET current_highest_bid = ? WHERE id = ?',
                [bidAmount, auctionId]
            );
            console.log('Auction current_highest_bid updated:', updateResult);

            await redisClient.set(`auction_${auctionId}`, bidAmount);

            await conn.commit();
            console.log('Transaction committed');
            conn.release();

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
        } finally {
            // Process the next item in the queue
            processNextInQueue(bidQueues, auctionId);
        }
    });

    // If the queue is not already processing, start processing
    if (queue.length === 1) {
        processNextInQueue(bidQueues, auctionId);
    }
};

const processNextInQueue = (bidQueues, auctionId) => {
    const queue = bidQueues.get(auctionId);

    if (queue && queue.length > 0) {
        const bidHandler = queue.shift(); // Get the first handler in the queue
        bidHandler(); // Execute the handler
    }
};

module.exports = handlePlaceBid;

