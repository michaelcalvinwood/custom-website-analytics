const ws = require('ws');
const listenPort = 5100;
const privateKeyPath = '/etc/letsencrypt/live/analytics.pymnts.com/privkey.pem';
const fullchainPath = '/etc/letsencrypt/live/analytics.pymnts.com/fullchain.pem';

const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');

const redis = require('redis');

const redisClient = redis.createClient(6379, '127.0.0.1');
let redisConnected = false;


redisClient.on('error', (err) => console.log('Redis Client Error', err));

const connectToRedis = async client => {
    await client.connect();
    redisConnected = true;
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

const processMessage = (info) => {
  return new Promise ((resolve, reject) => {
    let data = JSON.parse(info);
      
    if (typeof data.type === undefined) reject('missing type');

    switch (data.type) {
      case 'pageVisit':
          let key = `${todaysLocalDateAsYyyyMmDd()}|${data.uuid}|${data.ip}|${data.host}|${data.path}|${data.query}`;
          let incVal = data.ts;
    
          if (redisConnected) {
            redisClient.INCRBY(key, incVal);
          }
    
          console.log(key, incVal)
          resolve(incVal);
        break;
      default:
          console.error(`unknown type: ${data.type}`)
          reject(`unknown type: ${data.type}`);
    }



  })
}

wss.on('connection', function connection(ws, req) {
    console.log('connection');
    ws.on('message', function message(info) {
      processMessage(info);
    });
  });
  
server.listen(listenPort);