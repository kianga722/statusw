// import dependencies
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const http = require('http');
const url = require('url');
const path = require('path');
const axios = require('axios');
const socketIo = require('socket.io');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const port = process.env.PORT || 8081;

// Twitch variables
const clientId = process.env.TWITCH_CLIENT;
const clientSecret = process.env.TWITCH_SECRET;
const webhookSecret = process.env.WEBHOOK_SECRET;
let tokenOAuth = null; 

// define the Express app
const app = express();

// Middleware for verifying Twitch webhook notifications
app.use(bodyParser.json({
  verify: function (req, res, buf, encoding) {
    // is there a hub to verify against
    req.twitch_hub = false;
    if (req.headers && req.headers['x-hub-signature']) {
      console.log('req headers', req.headers)
      req.twitch_hub = true;

      let xHub = req.headers['x-hub-signature'].split('=');

      req.twitch_hex = crypto.createHmac(xHub[0], webhookSecret).update(buf).digest('hex')
      req.twitch_signature = xHub[1]
    }
  }
}));

// Prep WebSockets
const server = http.createServer(app);
const io = socketIo(server);

// WebSockets
let numConnections = 0;
let interval;

io.on('connection', socket => {
  numConnections += 1;
  console.log('New client connected')
  if (!interval) {
    // Keep alive while user has page open
    interval = setInterval(() => {
      console.log('KeepAlive')
    }, 60000)

    console.log('KeepAlive interval started')
  }
  
  socket.on('disconnect', () => {
    numConnections -= 1;
    console.log('Client disconnected')
    if (numConnections === 0) {
      clearInterval(interval)
      console.log('KeepAlive interval ended')
    }
  })
})


// Twitch OAuth Authorization Request
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

const getOAuth = async () => {
  try {
    const responseToken = await axios(authOptions)
    tokenOAuth = responseToken.data['access_token']
  } catch (error) {
    console.log(error)
  }
}

const streamerMap = {
  'AustinShow': 40197643,
  'AvoidingThePuddle': 23528098,
  'CohhCarnage': 26610234,
  'EsfandTV': 38746172,
  'fl0m': 25093116,
  'HasanAbi': 207813352,
  'LIRIK': 23161357,
  'Leffen': 53831525,
  'mang0': 26551727,
  'Mizkif': 94753024,
  'n0ne': 80615421,
  'TwitchPresents': 149747285,
  'xQcOW': 71092938
}

// Create end of Twitch URL query
const createURLend = (queryName, paramKey, arrParamValues) => {
  let end = `${queryName}?`;
  arrParamValues.map(a => {
    if (a === arrParamValues[arrParamValues.length - 1]) {
      end += `${paramKey}=${a}`;
    } else {
      end += `${paramKey}=${a}&`;
    }
  });
  return end;
}


// Prepare URL of streamers to get live status
const streamersLowerCase = Object.keys(streamerMap).map(d => d.toLowerCase())
const streamersURLend = createURLend('streams', 'user_login', streamersLowerCase)

// Request to get live status of streamers
// Only returns live streamers
const streamerOptions = token => {
  return {
    url: `https://api.twitch.tv/helix/${streamersURLend}
    `,
    method: 'get',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    },
  }
}
// Channel Request to get stream game name and title
// Returns data even if user is offline
const channelOptions = (token, arrIDs) => {
  const channelsURLend = createURLend('channels', 'broadcaster_id', arrIDs)
  return {
    url: `https://api.twitch.tv/helix/${channelsURLend}
    `,
    method: 'get',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    },
  }
}

const getStreamers = async () => {
  try {
    // Returns only live streamers
    const liveResponse = await axios(streamerOptions(tokenOAuth))

    const streamers = Object.keys(streamerMap)
    // Prepare streamer obj to send back
    const streamersLive = {};
    streamers.map((s) => {
      // All streamers in hash set offline initially
      streamersLive[s] = false;
      streamersLive[s] = {
        live: false,
        title: null,
        game: null
      }
    });

    const liveIDs = [];
    liveResponse.data.data.map(d => {
      // Gather live IDs
      liveIDs.push(d.user_id)
      // Set live streamers in streamer obj
      streamersLive[`${d.user_name}`].live = true;
    });

    // Get channel info from live streamers
    const infoResponse = await axios(channelOptions(tokenOAuth, liveIDs))
    // Set channel title and game names
    infoResponse.data.data.map(d => {
      streamersLive[`${d.broadcaster_name}`].title = d.title;
      streamersLive[`${d.broadcaster_name}`].game = d.game_name;
    })
    
    return {
      streamersLive,
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      await getOAuth()
      io.emit('broadcast', 'update')
    }
    console.log(error)
  }
}

// Current Subscriptions
const currentSubOptions = (token) => {
  return {
    url: 'https://api.twitch.tv/helix/webhooks/subscriptions',
    method: 'get',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    },
  }
}

// Webhooks Subscriptions
const webhookSubOptions = (token, userId, type) => {
  return {
    url: 'https://api.twitch.tv/helix/webhooks/hub',
    method: 'post',
    params: {
      'hub.callback': `${process.env.WEBHOOK_CALLBACK_URL}/subResponse`,
      'hub.mode': type,
      'hub.topic': `https://api.twitch.tv/helix/streams?user_id=${userId}`,
      'hub.lease_seconds': 86400,
      'hub.secret': webhookSecret
    },
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    },
  }
}

// Get all current subscriptions and find missing subs if there are less than the number in streamerMap
const webhookSubBulk = async (type) => {
  const streamerIds = Object.values(streamerMap)
  // Get all current subs
  const currentSubs = await axios(currentSubOptions(tokenOAuth));
  console.log('currentSubs', currentSubs.data)
  // Check if less than total in streamerMap list
  if (currentSubs.data.total < streamerIds.length) {
    // Temp list for finding missing streamers
    let streamerIdsLeft = [...streamerIds];
    // For each streamer in returned data, verify callback URL and remove from temp list
    for (let currentSub of currentSubs.data.data) {
      // Verify callback
      if (currentSub.callback === `${process.env.WEBHOOK_CALLBACK_URL}/subResponse`) {
        const parsed = url.parse(currentSub.topic)
        // Get Id and remove from temp list
        const userId = parseInt(parsed.query.split('=')[1])
        streamerIdsLeft = streamerIdsLeft.filter(s => {
          return s !== userId
        })
      }
    }
    // For each streamer left in the list, sub
    for (let userId of streamerIdsLeft) {
      await axios(webhookSubOptions(tokenOAuth, userId, type))
      console.log(`subbing to ${userId}`)
    }

    console.log('subbing complete')
  } 
  console.log('no subbing needed')
}


app.get('/init', async (req, res) => {
  try {
    if (!tokenOAuth) {
      // OAuth Authorization
      await getOAuth()
    }
    // Check current subs and sub if needed
    await webhookSubBulk('subscribe')
    // Retrieve list of streamers
    let streamerObj = await getStreamers()
    // Send streamer status and active ones back
    res.send(streamerObj);
  } catch (error) {
    console.log(error)
    // If OAuth error, get new token, check subs, and refresh streamers
    if (error.response && error.response.status === 401) {
      await getOAuth()
      await webhookSubBulk('subscribe')
      io.emit('broadcast', 'update')
      return res.status(200).end()
    }
    return res.status(500).send(error);
  }
});

// Get Twitch streamers
app.get('/getStreamers', async (req, res) => {
  try {
    // Check if OAuth token exists
    if (!tokenOAuth) {
      await getOAuth()
    }
    // Retrieve list of streamers
    let streamerObj = await getStreamers()
    // Send streamer status and active ones back
    res.send(streamerObj);
  } catch(error) {
    return res.status(500).send(error);
  }
})


// Twitch sub topic response
app.get('/subResponse', async (req, res) => {
  const hubChallenge = req.query['hub.challenge'];
  if (hubChallenge) {
    console.log('echo hub challenge')
    res.status(200).set('Content-Type', 'text/plain').send(hubChallenge)
    return
  }
  res.status(500).send('Server Error')
})

// Twitch webhook notification 
app.post('/subResponse', async (req, res) => {
  res.status(200).end()
  // Verify response is actually from Twitch
  if (!req.twitch_hub || !req.twitch_hex === req.twitch_signature) {
    return;
  }

  // Handle notification
  if (req.body.data.length === 0) {
    console.log('received stream end webhook')
  } else {
    const user = req.body.data[0].user_name
    console.log(`received stream change for user: ${user}`)
  }

  if (numConnections > 0) {
    console.log('current connections', numConnections)
    io.emit('broadcast', 'update')
  }

})


if (process.env.NODE_ENV === 'production') {
  // Serve any static files
  app.use(express.static(path.join(__dirname, 'frontend/build')));
}

// start the server
server.listen(port, () => {
  console.log(`listening on port ${port}`);
});
