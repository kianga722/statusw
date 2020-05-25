// import dependencies
const express = require('express');
const axios = require('axios');
const path = require('path');
// const fs = require('fs');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const port = process.env.PORT || 8081;

// define the Express app
const app = express();

// Twitch variables
const clientId = process.env.TWITCH_CLIENT;
const clientSecret = process.env.TWITCH_SECRET; 

// your application requests authorization
const authOptions = {
  url: 'https://id.twitch.tv/oauth2/token',
  method: 'post',
  params: {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  },
  headers: {
    'Accept':'application/json',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
};


// list of streamers to check status of
const streamers = [
  'avoidingthepuddle',
  'esfandtv',
  'fistpumpdude',
  'fl0m',
  'hasanabi',
  'lirik',
  'mang0',
  'mizkif',
  'rajjpatel',
  'twitchpresents',
  'xqcow',
];
// create Twitch URL query to append at end
let streamersURL = 'streams?';
streamers.map((s) => {
  if (s === streamers[streamers.length - 1]) {
    streamersURL += `user_login=${s}`;
  } else {
    streamersURL += `user_login=${s}&`;
  }
});

// retrieve list of streamers
app.get('/api/', async (req, res) => {
  const responseToken = await axios(authOptions)
  const token = responseToken.data['access_token']

  // Prepare Twitch request
  let twitchResponse = await axios({
    url: `https://api.twitch.tv/helix/${streamersURL}
    `,
    method: 'get',
    headers: {
      'Accept':'application/json',
      'Content-Type': 'application/json',
      'Client-ID': clientId,
      'Authorization': 'Bearer ' + token
    },
  })

  try {
    // initialize status hash and active array
    const streamersLive = {};
    const active = [];
    streamers.map((s) => {
      // all streamers in hash offline initially
      streamersLive[s] = false;
    });
    // map online streamers status to true
    twitchResponse.data.data.map((d) => {
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
  } catch(error) {
    return res.status(500).send(error);
  }

});


if (process.env.NODE_ENV === 'production') {
  // Serve any static files
  app.use(express.static(path.join(__dirname, 'frontend/build')));
}

// start the server
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
