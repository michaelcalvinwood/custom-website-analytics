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
const urlSubscriptions = {};
const hostSubscriptions = {};
const connections = {};

const setConnection = (uuid, ws) => {
  if (typeof connections[uuid] === 'undefined') connections[uuid] = ws;
}

const urlSubscribe = (uuid, url) => {
  console.log(`urlSubscribe: ${uuid} to ${url}`);

  if (typeof urlSubscriptions[url] === 'undefined') urlSubscriptions[url] = new Set();
  urlSubscriptions[url].add(uuid);
 
  if (typeof urlSubscriptions[uuid] === 'undefined') urlSubscriptions[uuid] = new Set();
  urlSubscriptions[uuid].add(url);
}

const hostSubscribe = (uuid, host) => {
  console.log(`hostSubscribe: ${uuid} to ${host}`);

  if (typeof hostSubscriptions[host] === 'undefined') hostSubscriptions[host] = new Set();
  hostSubscriptions[host].add(uuid);
 
  // you can only be subscribed to one host at a time
  hostSubscriptions[uuid] = host;
}

const handleSubscriptions = async (url, host) => {
  if (typeof urlSubscriptions[url] === 'undefined') return;
  let info = {};
  info.type = 'urlInfo';
  info.url = url;

  currentDate = todaysLocalDateAsYyyyMmDd();

  let key = `${currentDate}|uniquePageViewers|${url}`;
  info.uniquePageViewers = await redisClient.get(key);

  key = `${currentDate}|timeOnPage|${url}`;
  info.timeOnPage = await redisClient.get(key);

  key = `${currentDate}|uniqueSiteViewers|${host}`;
  info.uniqueSiteViewers = await redisClient.get(key);

  key = `${currentDate}|timeOnSite|${host}`;
  info.timeOnSite = await redisClient.get(key);

  urlSubscriptions[url].forEach(uuid => {
    connections[uuid].send(JSON.stringify(info));
  })
}

const unsubscribeAll = (uuid) => {
  if (typeof connections[uuid] !== 'undefined') delete connections[uuid];

  if (typeof urlSubscriptions[uuid] !== 'undefined') {
    urlSubscriptions[uuid].forEach(url => urlSubscriptions[url].delete(uuid));
    delete urlSubscriptions[uuid];
  }

  if (typeof hostSubscriptions[uuid] !== 'undefined') {
    delete hostSubscriptions[uuid];
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
        
        key = `${currentDate}|referrer|${url}|${data.referrer}`;
        await redisClient.INCRBY(key, 1);

        key = `${currentDate}|timeOnPage|${url}`;
        await redisClient.INCRBY(key, data.ts);
        
        key = `${currentDate}|pageViews|${url}`;
        await redisClient.INCRBY(key, 1);
      
        key = `${currentDate}|pageViewers|${url}`;
        result = await redisClient.SADD(key, data.uuid);

        if (result) {
          key = `${currentDate}|uniquePageViewers|${url}`;
          await redisClient.INCRBY(key, 1);      
        }

        key = `${currentDate}|siteViews|${data.host}`;
        await redisClient.INCRBY(key, 1);
      
        key = `${currentDate}|timeOnSite|${data.host}`;
        await redisClient.INCRBY(key, data.ts);
      
        key = `${currentDate}|siteViewers|${data.host}`;
        result = await redisClient.SADD(key, data.uuid);

        if (result) {
          key = `${currentDate}|uniqueSiteViewers|${data.host}`;
          await redisClient.INCRBY(key, 1);
        }

        if (data.isSubscriber) {
          setConnection(data.uuid, ws);
          urlSubscribe(data.uuid, url);
          hostSubscribe(data.uuid, data.host);
  
          handleSubscriptions(url, data.host);
        } else console.log(`${data.uuid} is not a subscriber`);
        return;
      break;
    case 'pageStay':
        currentDate = todaysLocalDateAsYyyyMmDd();
        url = data.host + data.path;

        key = `${currentDate}|timeOnPage|${url}`;
        timeOnPage = await redisClient.INCRBY(key, data.ts);

        key = `${currentDate}|timeOnSite|${data.host}`;
        await redisClient.INCRBY(key, data.ts);

        if (data.isSubscriber) handleSubscriptions(url, data.host);
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