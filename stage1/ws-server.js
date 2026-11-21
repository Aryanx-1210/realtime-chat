const {WebSocketServer, WebSocket} = require('ws');

const wss = new WebSocketServer({port: 8080});
const users = new Map();

function broadcast(obj){
    const data = JSON.stringify(obj);
    for(const client of wss.clients){
        if(client.readyState === WebSocket.OPEN)client.send(data);
    }
}

wss.on('connection', (ws) => {
    console.log('client connected');

    ws.on('message', (raw) => {
        let msg;
        try{msg = JSON.parse(raw);} catch {return;}

        if(msg.type === 'join'){
            users.set(ws, msg.username);
            broadcast({type: 'system', text: `${msg.username} joined`});
        } else if(msg.type === 'chat'){
            const from = users.get(ws);
            if(!from) return;
            broadcast({type: 'chat', from, text: msg.text});
        }
    });

    ws.on('clsoed', () =>{
        const name = users.get(ws);
        users.delete(ws);
        if(name) broadcast({type: 'system', text: `${name} left`});
    });
});

console.log('WS server on ws://localhost:8080');