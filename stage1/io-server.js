const {Server} = require('socket.io');

const io = new Server(3000, {cors: {origin: '*'}}); //we store the server instance in 'io'
const users = new Map();

io.on('connection', (socket) => {
    console.log('connected:', socket.id);

    //Joining with a username
    socket.on('join', (username, ack) => {
        if(!username || users.has(username)){
            return ack?.({ok: false, error: 'Username missing or taken'});
        }

        socket.data.username = username;
        users.set(username, socket.id);
        ack?.({ok: true});
        socket.broadcast.emit('system', `${username} joined the chat`);
    });

    socket.on('chat', (text) => {
        const from = socket.data.username;
        if(!from) return;
        io.emit('chat', {from, text});
    });

    socket.on('private', ({to, text}, ack) => {
        const from = socket.data.username;
        const targetId = users.get(to);
        if(!from) return;
        if(!targetId) return ack?.({ok: false, error: `${to} is not online`});
        io.to(targetId).emit('private', {from, text});
        ack?.({ok: true});
    });

    socket.on('joinRoom', (room) => {
        const name = socket.data.username;
        if(!name) return;
        socket.join(room);
        socket.emit('system', `You joined #${room}`);
        socket.to(room).emit('system', `${name} joined #${room}`);
    });

    socket.on('leaveRoom', (room) => {
        const name = socket.data.username;
        socket.leave(room);
        socket.emit('system', `You left #${room}`);
        socket.to(room).emit('system', `${name} left #${room}`);
    });

    socket.on('roomChat', ({room, text}) => {
        const from = socket.data.username;
        if(!from || !socket.rooms.has(room)) return;
        io.to(room).emit('room', {room, from , text});
    });

    socket.on('disconnect', () => {
        const name = socket.data.username;
        if(name){
            users.delete(name);
            io.emit('system', `${name} disconnected`);
        }
    });
});

console.log('Socket.io server on http://localhost:3000');