require('dotenv').config();

const {google} = require('googleapis');
const {JWT} = require('google-auth-library');
const searchconsole = google.searchconsole('v1');
const keys = require('./clientSecret.json');
const axios = require('axios');
const { v4: uuidv4, v4 } = require('uuid');

//console.log(keys);

// Search Console API

const request = {
    email: keys.client_email,
    key: keys.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters','https://www.googleapis.com/auth/webmasters.readonly'],
  };
const client = new JWT(request);
google.options({auth: client});

// Check to see which properties are accessible with these credentials

const searchConsoleQuery = async () => {
    const resSiteList = await searchconsole.sites.list({});
    console.log(resSiteList.data);

    const resSearchAnalytics = await searchconsole.searchanalytics.query({
        // The site's URL, including protocol. For example: `http://www.example.com/`.
        siteUrl: 'https://www.pymnts.com/',
        requestBody: {
             "endDate": "2022-12-24",
             "startDate": "2022-03-01",
             "dimensions": ["date"]
        },
      });
      
      console.log(resSearchAnalytics.data.rows);
}


// G3 Analytics Query
// Parameters: https://developers.google.com/analytics/devguides/reporting/core/v3/reference
// https://flaviocopes.com/google-analytics-api-nodejs/

const analyticsQueryG3 = async () => {
  const scopes = 'https://www.googleapis.com/auth/analytics.readonly'
  const jwt = new google.auth.JWT(process.env.CLIENT_EMAIL, null, process.env.PRIVATE_KEY, scopes);
  const viewId = '22567948';
  const response = await jwt.authorize()
  const result = await google.analytics('v3').data.ga.get({
    'auth': jwt,
    'ids': 'ga:' + viewId,
    'start-date': '30daysAgo',
    'end-date': 'today',
    'metrics': 'ga:pageviews'
  })

  console.dir(result.data.rows[0][0]);

  let test = JSON.stringify(result.data.rows, null, 4);

  console.log(test);

}


// G3 Measurement Protocol for Sending Events
// Parameters: https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters
// https://developers.google.com/analytics/devguides/collection/protocol/v1/
// use /debug/collect for testing

const sendPageViewG3 = async (url, title, propertyId = 'UA-11167465-10') => {
    const request = {
      url: 'https://www.google-analytics.com/collect',
      method: 'post',
      params: {
        v: 1,
        tid: propertyId,
        cid: '0b47ceb1-8abb-4c90-8995-57c3cdf32c14',
        t: 'pageview',
        dl: url,
        dt: title,
        ua: 'Axios User Agent'
      }
    }

    axios(request)
    .then(response => {
      console.log('response', response.data, response.data.parserMessage);
    })
    .catch(error => {
      console.error('error', error);
    })
}

// G4 Analytics Query
// Develop with domains that I own

// G4 Measurement Protocol for Sending Events
// https://developers.google.com/analytics/devguides/collection/protocol/ga4



// playground

sendPageViewG3('https://dev.pymnts.com/today-on-pymnts/', 'Today on Pymnts', 'UA-11167465-10');
//analyticsQueryG3();

