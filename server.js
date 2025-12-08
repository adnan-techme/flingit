const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    // 1. Identify IP
    let clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    // Normalize IPv6 mapped IPv4
    if (typeof clientIp === 'string') {
        if (clientIp.startsWith('::ffff:')) {
            clientIp = clientIp.substr(7);
        }
    }
    // Normalize localhost
    if (clientIp === '::1') clientIp = '127.0.0.1';

    console.log(`[CONN] Socket: ${socket.id} | IP: ${clientIp}`);

    // 2. Auto-Join Room
    const roomName = `network-${clientIp}`;
    socket.join(roomName);

    // Check Room Size
    const room = io.sockets.adapter.rooms.get(roomName);
    const size = room ? room.size : 0;

    console.log(`[ROOM] Joined ${roomName} | Total Size: ${size}`);

    // 3. Auto-Discovery Event
    if (size >= 2) {
        console.log(`[MATCH] Emitting peer-found to ${roomName}`);
        io.to(roomName).emit('peer-found');
    }

    // --- SIGNALING ---
    socket.on('file-offer', (data) => {
        console.log(`[OFFER] From ${socket.id}`);
        socket.to(roomName).emit('file-offer', data);
    });

    socket.on('file-chunk', (data) => {
        // log(`[CHUNK] From ${socket.id}`); // Too verbose for chunks
        socket.to(roomName).emit('file-chunk', data);
    });

    socket.on('disconnect', () => {
        console.log(`[DISC] Socket: ${socket.id}`);
        // Check if room is empty or size < 2
        const roomAfter = io.sockets.adapter.rooms.get(roomName);
        const sizeAfter = roomAfter ? roomAfter.size : 0;

        if (sizeAfter < 2) {
            console.log(`[LOST] Room ${roomName} less than 2 peers.`);
            io.to(roomName).emit('peer-lost');
        }
    });

    socket.on('reset-session', () => {
        io.to(roomName).emit('reset-session');
    });
});

server.listen(PORT, () => {
    console.log(`FlingIt Zero-Click Server running on port ${PORT}`);
});
