const {io} = require('socket.io-client');
const readline = require('readline');
const { read } = require('fs');

const username = process.argv[2];
if(!username){
    console.log('Usage: node io-client.js <username>');
    process.exit(1);
}

const socket = io('http://localhost:3000');
const rl = readline.createInterface({input: process.stdin, output: process.stdout});

const print = (line) =>{
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(line);
    rl.prompt(true);
};

socket.on('connect', () => {
    socket.emit('join', username, (res) => {
        if(!res.ok){ console.log(res.error); process.exit(1);}
        print(`Joined as ${username}. Commands: /msg user text | /join room | /leave room | /room room text | /quit`);
    });
});

socket.on('system', (t) => {print(`* ${t}`)});
socket.on('chat', ({from, text}) => {print(`${from}: ${text}`)});
socket.on('private', ({from, text}) => {print(`[private from ${from}] ${text}`); });
socket.on('room', ({room, from, text}) => {print(`[#${room}] ${from}: ${text}`); });

rl.setPrompt('> ');
rl.prompt();

rl.on('line', (line) => {
    line = line.trim();
    if(line.startsWith('/msg ')){
        const[, to, ...rest] = line.split(' ');
        socket.emit('private', {to, text: rest.join(' ')}, (res) => {
            if(!res.ok) print(res.error);
        });
    } 
    else if(line.startsWith('/join ')){
        socket.emit('joinRoom', line.split(' ')[1]);
    }
    else if(line.startsWith('/leave ')){
        socket.emit('leaveRoom', line.split(' ')[1]);
    }
    else if(line.startsWith('/room ')){
        const[, room, ...rest] = line.split(' ');
        socket.emit('roomChat', {room, text: rest.join(' ')});
    }
    else if(line === '/quit'){
        process.exit(0);
    }
    else if(line){
        socket.emit('chat', line);
    }
    rl.prompt();
});