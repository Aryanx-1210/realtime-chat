require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PAGE_SIZE = 50;
const USER_RE = /^[A-Za-z0-9_]{2,20}$/;
const ROOM_RE = /^[a-z0-9_-]{1,30}$/;

const online = new Map(); // Map of socket.id to username
const roomIdCache = new Map(); // Cache for room IDs

// -------------DB Helpers-----------------

async function getOrCreateUser(username) {
    const {rows} = await db.query(
        'INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id, username',
        [username]
    );
    return rows[0];
}

async function getOrCreateRoomId(name) {
  if (roomIdCache.has(name)) return roomIdCache.get(name);
  const { rows } = await db.query(
    `INSERT INTO rooms (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name]
  );
  roomIdCache.set(name, rows[0].id);
  return rows[0].id;
}

//Cursor pagination: "message older than id x"
async function fetchHistory(roomId, beforeId = null, limit = PAGE_SIZE) {
    const {rows} = await db.query(
        `SELECT m.id, m.body, m.created_at, u.username as "from"
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.room_id = $1 
        AND ($2::bigint IS NULL OR m.id < $2::bigint)
        ORDER BY m.id DESC
        LIMIT $3`,
        [roomId, beforeId, limit+1] //-> one extra row tells us if more exists
    );
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return { messages: rows.reverse(), hasMore };
}


//-------------REST: load older messages-----------------
app.get('api/rooms/:name/messages', async(req, res) => {
    try{
        const name = req.params.name.toLowerCase();
        if(!ROOM_RE.test(name)) return res.status(400).json({error: 'Bad room'});
        const roomId = await getOrCreateRoomId(name);
        const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
        res.json(await fetchHistory(roomId, beforeId));
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'Internal server error'});
    }
});


//------------SOCKET.IO-----------------
io.on('connection', (socket) => {
    socket.on('join', async (username, ack) =>{
        try{
            if(!USER_RE.test(username || '')){
                return ack?.({ok: false, error: 'Username must be 2-20 letters, numbers or _'});
            }
            if(online.has(username)){
                return ack?.({ok: false, error: 'That user is already online'});
            }

            const user = await getOrCreateUser(username);
            socket.data.userId = user.id;
            socket.data.username = user.username;
            online.set(socket.id, user.username);
            ack?.({ok:true, username: user.username});
        } catch (error) {
            console.error(error);
            ack?.({ok: false, error: 'Internal server error'});
        }
    });

    
    socket.on('joinRoom', async (room, ack) => {
        try{
            const username = socket.data.username;
            room = String(room || '').toLowerCase();
            if(!username) return ack?.({ok: false, error: 'Join First'});
            if(!ROOM_RE.test(room)) return ack?.({ok: false, error: 'Bad room name'});

            const roomId = await getOrCreateRoomId(room);
            socket.join(room);
            const {messages, hasMore} = await fetchHistory(roomId);

            ack?.({ok: true, room, messages, hasMore});
            socket.to(room).emit('system', {room, text: `${username} has joined  #${room}`});
        } catch (error){
            console.error(error);
            ack?.({ok: false, error: 'Internal server error'});     
        }
    });


    socket.on('leaveRoom',(room) =>{
        const username = socket.data.username;
        if(!username ||  !socket.rooms.has(room))return;
        socket.leave(room);;
        socket.to(room).emit('system', {room, text: `${username} has left #${room}`});
    });


    socket.on('roomChat', async({room, text} = {}, ack) => {
        try{
            const username = socket.data.username;
            text = String(text || '').trim();
            if(!username || !socket.rooms.has(room)){
                return ack?.({ok: false, error: 'Not in that room'});
            }      
            if(!text || text.length > 2000){
                return ack?.({ok: false, error: 'Message empty or too long'});
            }

            const roomId = await getOrCreateRoomId(room);

            //Save first and then broadcast
            const {room} = await db.query(
                `INSERT INTO messages (room_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
                [roomId, socket.data.userId, text]
            );

            io.to(room).emit('room',{
                id: rows[0].id,
                room,
                from: username,
                text,
                created_at: rows[0].created_at, //broadcast to all in room
            });
            ack?.({ok: true});
        } catch (err){
            console.error(err);
            ack?.({ok: false, error: 'Could not save message'});
        }
    });

    socket.on('disconnect', ()=> {
        const username = socket.data.username;
        if(username && online.get(username) === socket.id) online.delete(username);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Chat on http://localhost:${PORT}`));