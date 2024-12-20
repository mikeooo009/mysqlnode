# README

This repository contains a Node.js application that provides both a RESTful API and WebSocket functionality for managing online auctions, placing bids, and retrieving auction and bid information in real-time.

## Features

1. **Auctions Management**:  
   - Add new auctions with associated cars.
   - Track auction start and end times.

2. **Bidding System**:  
   - Place bids on active auctions.
   - Current highest bids are maintained in both the MySQL database and a Redis cache for performance.
   - Real-time bid updates are pushed to connected WebSocket clients.

3. **WebSockets for Real-Time Updates**:  
   - Clients can join an auction room via WebSocket.
   - When a new bid is placed, all clients in that room receive immediate notification.

4. **Rate Limiting & Security**:  
   - API endpoints are protected with rate limiting to prevent abuse.
   - WebSocket connections and messages are rate-limited per IP.
   - Limits on connections per IP to maintain server performance and prevent DoS attacks.

5. **Swagger API Documentation**:  
   - `/api-docs` route is available for interactive API documentation powered by Swagger UI.

## Prerequisites

- **Node.js & npm**: Make sure you have Node.js (>= 14.x) and npm installed.
- **MySQL Database**: A MySQL instance with the required schema:
  - `Auctions` table with columns (`id`, `name`, `start_time`, `end_time`, `car_id`, `current_highest_bid`).
  - `Bids` table with columns (`id`, `auction_id`, `user_id`, `bid_amount`, `timestamp`).
  - `Cars` table with columns (`id`, `name`, `image`, `starting_bid`, `auction_end`).
- **Redis**: A running Redis instance for caching the highest bid amounts.
- **Swagger JSON**: A `swagger.json` file configured for the available endpoints.

## Directory Structure

```
.
├── db.js               # MySQL connection pool configuration
├── redis.js            # Redis client configuration
├── handlePlaceBid.js   # Bid placement logic (transactional, queued)
├── swagger.json         # Swagger configuration for API docs
├── server.js           # Main server file (contains WebSocket, routes, and logic)
└── README.md           # This README
```

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Database & Redis Setup**:
   - Ensure your MySQL database is running and has the correct schema and tables.
   - Ensure Redis is running and accessible.
   - Update `db.js` and `redis.js` with correct connection details (host, port, credentials).

4. **Swagger Documentation**:
   - Confirm `swagger.json` is in place and properly describes your endpoints.
   - The docs will be served at `http://localhost:3000/api-docs`.

## Environment Variables

Create a `.env` file or use environment variables to configure:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` for MySQL.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` for Redis (if applicable).
- Other configuration parameters as needed (e.g., port customization).

## Running the Server

After configuration:

```bash
npm start
```

This will start the HTTP server on `http://localhost:3000` and the WebSocket server on `ws://localhost:8080`.

## API Endpoints

- **GET /bids**:  
  Fetches all auctions along with their bids.

- **POST /addAuction**:  
  Adds a new auction. Requires `name`, `start_time`, `end_time`, and `car_id`.

- **POST /addBid**:  
  Adds a new bid to an auction. Requires `auction_id`, `bid_amount`, and `user_id`.

- **POST /addCar**:  
  Adds a new car to the database with fields: `name`, `image`, `startingBid`, and `auctionEnd`.

### Rate Limits

- `POST /placeBid` is rate-limited to 1 request per second per IP.

## WebSocket Interaction

- **ws://localhost:8080**:  
  Connect to the WebSocket server.
  
  **Supported Actions**:  
  - `joinAuction`: Join a specific auction room.
    ```json
    {
      "action": "joinAuction",
      "payload": {
        "auctionId": 123
      }
    }
    ```
  - `placeBid`: Place a bid in a specific auction.
    ```json
    {
      "action": "placeBid",
      "payload": {
        "userId": 1,
        "auctionId": 123,
        "bidAmount": 1000
      }
    }
    ```

  **Real-Time Updates**:  
  When a new bid is placed, all WebSocket clients in that auction’s room receive a message like:
  ```json
  {
    "message": "New bid: 1000",
    "auctionId": 123
  }
  ```

## Security and Performance

- **IP-based rate limiting** ensures that users cannot spam the server with requests.
- **MySQL transactions and row locking** ensure data consistency when multiple users place bids simultaneously.
- **Redis caching** improves performance and scalability.
- **WebSocket and connection/message limits** prevent excessive load from a single IP.

## Swagger UI

Access the API documentation at:  
[http://localhost:3000/api-docs](http://localhost:3000/api-docs)

You can use the Swagger UI to test endpoints, view parameters, and responses.

## Troubleshooting

- **Database Connections**:  
  Check `db.js` for correct MySQL credentials and ensure the database server is running.
  
- **Redis Connection**:  
  Check `redis.js` for correct Redis credentials and ensure Redis is running.
  
- **Missing Tables or Columns**:  
  Ensure your database schema matches the expected tables and columns.

- **Port Conflicts**:  
  If port `3000` (HTTP) or `8080` (WebSocket) is in use, update the port in `server.js`.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-new-feature`
3. Commit changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Create a new Pull Request

## License

This project is provided under the MIT License. See the [LICENSE](LICENSE) file for details.
