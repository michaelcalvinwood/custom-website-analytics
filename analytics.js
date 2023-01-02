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

const urlSet = {};
const subscriptions = {};
const connections = {};

const subscribe = (uuid, url, ws) => {
  console.log(`subscribe: ${uuid} to ${url}`);

  if (typeof connections[uuid] === 'undefined') connections[uuid] = ws;

  if (typeof subscriptions[url] === 'undefined') subscriptions[url] = new Set();
  subscriptions[url].add(uuid);
 
  if (typeof subscriptions[uuid] === 'undefined') subscriptions[uuid] = new Set();
  subscriptions[uuid].add(url);
}

const handleSubscriptions = async url => {
  if (typeof subscriptions[url] === 'undefined') return;
  let info = {};
  info.type = 'urlInfo';
  info.url = url;

  currentDate = todaysLocalDateAsYyyyMmDd();
  let key = `${currentDate}|${url}|uniquePageViewers`;
  info.uniquePageViewers = await redisClient.get(key);

  key = `${currentDate}|${url}|timeOnPage`;
  info.timeOnPage = await redisClient.get(key);

  subscriptions[url].forEach(uuid => {
    connections[uuid].send(JSON.stringify(info));
  })
}

const unsubscribeAll = (uuid) => {
  if (typeof connections[uuid] !== 'undefined') delete connections[uuid];

  if (typeof subscriptions[uuid] !== 'undefined') {
    subscriptions[uuid].forEach(url => subscriptions[url].delete(uuid));
    delete subscriptions[uuid];
  }

  console.log(`unsubscribe: ${uuid} from all`);
}

const processMessage = async (info, ws) => {
  let data = JSON.parse(info);
    
  if (typeof data.type === undefined) return;

  if (!redisConnected) return;

  let currentDate, key, incVal,result, totalPageViews, uniquePageViews, timeOnPage, url;

  switch (data.type) {
    case 'pageVisit':
        currentDate = todaysLocalDateAsYyyyMmDd();
      
        url = data.host + data.path;
        ws.uuid = data.uuid;
        ws.url = url;
        
        let value;

        key = `${currentDate}|referrer|${url}|${data.referrer}`;
        value = await redisClient.INCRBY(key, 1);
        console.log(key, value);
        

        key = `${currentDate}|timeOnPage|${url}`;
        incVal = data.ts;
        value = await redisClient.INCRBY(key, incVal);
        console.log(key, value);
        
        key = `${currentDate}|pageViews|${url}`;
        incVal = 1;
        totalPageViews = await redisClient.INCRBY(key, 1);
        console.log(key, totalPageViews);

        key = `${currentDate}|viewers|${url}`;
        result = await redisClient.SADD(key, data.uuid);

        if (result) {
          key = `${currentDate}|${url}|uniquePageViewers`;
          incVal = 1;
          uniquePageViews = await redisClient.INCRBY(key, 1);
          console.log(key, uniquePageViews);
        }

        subscribe(data.uuid, url, ws);

        handleSubscriptions(url);
        return;
      break;
    case 'pageStay':
        currentDate = todaysLocalDateAsYyyyMmDd();
        url = data.host + data.path;

        key = `${currentDate}|${url}|timeOnPage`;
        incVal = data.ts;
        timeOnPage = await redisClient.INCRBY(key, incVal);
        
        handleSubscriptions(url);
        return;
      break;
    default:
        console.error(`unknown type: ${data.type}`)
        return;
  }
}

wss.on('connection', (ws, req) => {
    console.log('connection', wss.clients.size);
    
    ws.on('message', function message(info) {
      processMessage(info, ws);
    });

    ws.on('close', () => {
      unsubscribeAll(ws.uuid);

      console.log('closed connection', ws.uuid, wss.clients.size);
    })
  });
  
server.listen(listenPort);