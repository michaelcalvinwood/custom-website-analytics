const ws = require('ws');
const listenPort = 5100;
const privateKeyPath = '/etc/letsencrypt/live/node.pymnts.com/privkey.pem';
const fullchainPath = '/etc/letsencrypt/live/node.pymnts.com/fullchain.pem';

const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '200mb'})); 
app.use(cors());

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

const server = https.createServer({
    key: fs.readFileSync(privateKeyPath),
    cert: fs.readFileSync(fullchainPath),
  }, app);
  

const wss = new ws.WebSocketServer({ server });

wss.on('connection', function connection(ws) {
    ws.on('message', function message(data) {
      console.log('received: %s', data);
    });
  
    ws.send('something');
  });
  
  server.listen(listenPort);