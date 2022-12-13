const ws = require('ws');
const listenPort = 5100;
const privateKeyPath = '/etc/letsencrypt/live/analytics.pymnts.com/privkey.pem';
const fullchainPath = '/etc/letsencrypt/live/analytics.pymnts.com/fullchain.pem';

const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');

const redis = require('redis');

var redisClient = redis.createClient(6379, '127.0.0.1');

redisClient.on('error', (err) => console.log('Redis Client Error', err));

const connectToRedis = async client => {
    await client.connect();

    await client.set('greeting', 'hello world from redis');
    const value = await client.get('greeting');

    console.log(value);
}

connectToRedis(redisClient);

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '200mb'})); 
app.use(cors());

const todaysLocalDateAsYyyyMmDd = () => {
  let yourDate = new Date()
  const offset = yourDate.getTimezoneOffset()
  yourDate = new Date(yourDate.getTime() - (offset*60*1000))
  return yourDate.toISOString().split('T')[0]
}

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

const server = https.createServer({
    key: fs.readFileSync(privateKeyPath),
    cert: fs.readFileSync(fullchainPath),
  }, app);
  

const wss = new ws.WebSocketServer({ server });

wss.on('connection', function connection(ws, req) {
    console.log('connection');
    ws.on('message', function message(info) {

      let data = JSON.parse(info);
      
      let key = `${todaysLocalDateAsYyyyMmDd()}|${data.uuid}|${data.ip}|${data.host}|${data.path}|${data.query}`;
      let incVal = data.ts;

      console.log(key, incVal)
      
    });
  
    //ws.send('something');
  });
  
server.listen(listenPort);