// import dependencies
const express = require('express');
const axios = require('axios');
const path = require('path');

const port = process.env.PORT || 8081;

// define Express app
// define the Express app
const app = express();

// define Twitch variables
const clientId = '6td2aro2su4uj0vyw04mvcgz2a95et';

const helix = axios.create({
  baseURL: 'https://api.twitch.tv/helix/',
  headers: { 'Client-ID': clientId },
});

// list of streamers to check status of
const streamers = [
  'avoidingthepuddle',
  'fistpumpdude',
  'mang0',
  'overwatchleague',
  'rajjpatel',
  'twitchpresents',
  'xqcow',
];
// create Twitch URL query
let streamersURL = 'streams?';
streamers.map((s) => {
  if (s === streamers[streamers.length - 1]) {
    streamersURL += `user_login=${s}`;
  } else {
    streamersURL += `user_login=${s}&`;
  }
});

// retrieve list of streamers
app.get('/api/', (req, res) => {
  helix.get(streamersURL)
    .then((streams) => {
      // initialize status hash and active array
      const streamersLive = {};
      const active = [];
      streamers.map((s) => {
        // all streamers in hash offline initially
        streamersLive[s] = false;
      });
      // map online streamers status to true
      streams.data.data.map((d) => {
        const streamer = d.user_name.toLowerCase();
        streamersLive[`${streamer}`] = true;
        // create array of active streamers
        active.push(streamer);
      });
      // send streamer status and active ones back
      res.send({
        streamersLive,
        active: active.sort(),
      });
    })
    .catch((error) => {
      res.send({
        status: '500',
        message: error,
      });
    });
});


if (process.env.NODE_ENV === 'production') {
  // Serve any static files
  app.use(express.static(path.join(__dirname, 'frontend/build')));
}

// start the server
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
