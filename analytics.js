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

let urlSet = {};
let subscriptions = {};
let connections = {};

const urlSubscribe = (uuid, url) => {
  console.log(`urlSubscribe: ${uuid} to ${url}`);

  subscriptions[uuid].urls.add(url);
}

const handleSubscriptions = async () => {
  console.log('handleSubscriptions');

  let key;
  currentDate = todaysLocalDateAsYyyyMmDd();

  let uuids = Object.keys(subscriptions);
  console.log('uuids', uuids);

  uuids.forEach(async uuid => {
    let info = {};
    info.type = 'urlInfo';
    
    let host = subscriptions[uuid].host;
    
    key = `${currentDate}|uniqueSiteViewers|${host}`;
    let uniqueSiteViewers = await redisClient.get(key);
  
    key = `${currentDate}|timeOnSite|${host}`;
    let timeOnSite = await redisClient.get(key);
  
    info.host = {
      host, uniqueSiteViewers, timeOnSite
    }

    info.urls = [];
    const urls = [...subscriptions[uuid].urls];
    
    for (let i = 0; i < urls.length; ++i) {
      let url = urls[i];
      console.log('forEach url', url);
      key = `${currentDate}|uniquePageViewers|${url}`;
      let uniquePageViewers = await redisClient.get(key);
    
      key = `${currentDate}|timeOnPage|${url}`;
      let timeOnPage = await redisClient.get(key);
  
      info.urls.push({
        url, uniquePageViewers, timeOnPage
      })
    }
   
    
    subscriptions[uuid].connection.send(JSON.stringify(info));
  })
}

setInterval(handleSubscriptions, 5000);

const unsubscribeAll = (uuid) => {

  delete subscriptions[uuid];

  console.log(`unsubscribe: ${uuid} from all`);
}

const processMessage = async (info, ws) => {
  let data = JSON.parse(info);
  console.log(data);

    
  if (typeof data.type === undefined) return;

  if (!redisConnected) return;

  let currentDate, key, incVal,result, totalPageViews, uniquePageViews, timeOnPage, url;

  currentDate = todaysLocalDateAsYyyyMmDd();
      
  switch (data.type) {
    case 'pageVisit':  
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
          if (typeof subscriptions[data.uuid] === 'undefined') {
          
            subscriptions[data.uuid] = {};
            subscriptions[data.uuid].urls = new Set();
            subscriptions[data.uuid].host = data.host;
            subscriptions[data.uuid].connection = ws;
          }

          urlSubscribe(data.uuid, url);
  
          handleSubscriptions();
        } else console.log(`${data.uuid} is not a subscriber`);
        return;
      break;
    case 'pageStay':
        url = data.host + data.path;

        key = `${currentDate}|timeOnPage|${url}`;
        timeOnPage = await redisClient.INCRBY(key, data.ts);

        key = `${currentDate}|timeOnSite|${data.host}`;
        await redisClient.INCRBY(key, data.ts);
        return;
      break;
    case 'urlSubscribe':
        const {host, path, uuid} = data;

        urlSubscribe(uuid, host + path);
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