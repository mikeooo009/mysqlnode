const WebSocket = require('ws');

describe('WebSocket Server Tests', () => {
    let ws;

    beforeAll((done) => {
        ws = new WebSocket('ws://localhost:8080');
        ws.on('open', done);
    });

    afterAll(() => {
        ws.close();
    });

    test('Join Auction', (done) => {
        ws.send(
            JSON.stringify({
                action: 'joinAuction',
                payload: { auctionId: 1 }
            })
        );

        ws.on('message', (message) => {
            const data = JSON.parse(message);
            expect(data.message).toBe('Joined auction 1');
            done();
        });
    });

    test('Place Bid', (done) => {
        console.log('Sending placeBid message...');
        ws.send(
            JSON.stringify({
                action: 'placeBid',
                payload: { userId: 1, auctionId: 1, bidAmount: 100 }
            })
        );

        ws.on('message', (message) => {
            console.log('Received message:', message);
            const data = JSON.parse(message);
            expect(data.message).toContain('New bid');
            done();
        });
    }, 20000);


});
