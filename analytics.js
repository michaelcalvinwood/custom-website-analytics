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

let todaysDate = todaysLocalDateAsYyyyMmDd();

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

const server = https.createServer({
    key: fs.readFileSync(privateKeyPath),
    cert: fs.readFileSync(fullchainPath),
  }, app);
  
const wss = new ws.WebSocketServer({ server });

const processMessage = (info) => {
  return new Promise (async (resolve, reject) => {
    let data = JSON.parse(info);
      
    if (typeof data.type === undefined) resolve('missing type');

    if (!redisConnected) resolve('redis not connected');

    let currentDate, key, incVal;

    switch (data.type) {
      case 'pageVisit':
          currentDate = todaysLocalDateAsYyyyMmDd();
          key = `${currentDate}|${data.uuid}|${data.ip}|${data.host}|${data.path}|${data.query}`;
          incVal = data.ts;
          redisClient.INCRBY(key, incVal);
          console.log(key, incVal);
          
          key = `${currentDate}|${data.path}`;
          incVal = 1;
          redisClient.INCRBY(key, 1);
          console.log(key, incVal);
          
          resolve(incVal);
        break;
      case 'pageStay':
          currentDate = todaysLocalDateAsYyyyMmDd();
          key = `${currentDate}|${data.uuid}|${data.ip}|${data.host}|${data.path}|${data.query}`;
          incVal = data.ts;
          redisClient.INCRBY(key, incVal);
          console.log(key, incVal);
          
          resolve(incVal);
        break;
      default:
          console.error(`unknown type: ${data.type}`)
          resolve(`unknown type: ${data.type}`);
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