# Testing WebSocket in Postman

This guide provides step-by-step instructions on how to test WebSocket functionality using Postman.

---

## Steps to Test WebSocket in Postman

### 1. Open Postman
1. Launch Postman.
2. Click on the "+" tab to open a new request.

---

### 2. Switch to WebSocket
1. Change the request type to WebSocket:
   - Click the dropdown beside the request type (e.g., **GET**).
   - Select **WebSocket Request**.

---

### 3. Connect to the WebSocket Server
1. Enter your WebSocket server URL in the request field.
   - Example: `ws://localhost:8080` or your actual WebSocket endpoint.
2. Click **Connect**.
3. Verify the connection with the confirmation message.

---

### 4. Test WebSocket Actions

#### Send a Message
1. After establishing a connection, send messages by entering the JSON payload in the request body.
2. Examples:
   - **To join an auction**:
     ```json
     {
         "action": "joinAuction",
         "payload": { "auctionId": 101 }
     }
     ```
   - **To place a bid**:
     ```json
     {
         "action": "placeBid",
         "payload": { "userId": 1, "auctionId": 101, "bidAmount": 150 }
     }
     ```
   - **To end an auction**:
     ```json
     {
         "action": "auctionEnd",
         "payload": { "auctionId": 101 }
     }
     ```

#### Observe Responses
1. The WebSocket server will send responses in the same window.
2. Example response for placing a bid:
   ```json
   {
       "message": "New bid: 150",
       "auctionId": 101
   }
