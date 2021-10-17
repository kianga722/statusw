// import dependencies
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const http = require('http');
const url = require('url');
const path = require('path');
const axios = require('axios');
const socketIo = require('socket.io');

// Get streamers from separate file
const streamerMap = require('./streamers.json');


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
  verify: (req, res, buf) => {
      // Small modification to the JSON bodyParser to expose the raw body in the request object
      // The raw body is required at signature verification
      req.rawBody = buf
  }
}))

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
    url: `https://api.twitch.tv/helix/${streamersURLend}`,
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
    url: `https://api.twitch.tv/helix/${channelsURLend}`,
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
    if (liveIDs.length > 0) {
      const infoResponse = await axios(channelOptions(tokenOAuth, liveIDs))
      // Set channel title and game names
      infoResponse.data.data.map(d => {
        streamersLive[`${d.broadcaster_name}`].title = d.title;
        streamersLive[`${d.broadcaster_name}`].game = d.game_name;
      })
    }
    
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
    url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
    method: 'get',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    },
  }
}

// Webhooks Subscriptions
const webhookSubOptions = (token, userId, type) => {
  // type is a string
  // stream.online
  // stream.offline

  const objData = {
    "type": type,
    "version": "1",
    "condition": {
      "broadcaster_user_id": userId
    },
    "transport": {
      "method": "webhook",
      "callback": `${process.env.WEBHOOK_CALLBACK_URL}/subResponse`,
      "secret": webhookSecret
    }
  }

  return {
    url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
    method: 'post',
    data: JSON.stringify(objData),
    headers: {
      'Content-Type': 'application/json',
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    },
  }
}


// Webhooks Subscriptions
const webhookSubDelete = (token, subId) => {
  return {
    url: `https://api.twitch.tv/helix/eventsub/subscriptions?id=${subId}`,
    method: 'delete',
    headers: {
      'Content-Type': 'application/json',
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

  // Delete all subs first in case of notification_failures_exceeded error
  if (currentSubs.data.total > 0) {
    for (let sub of currentSubs.data.data) {
      await axios(webhookSubDelete(tokenOAuth, sub.id))
    }
  }

  // For each streamer left in the list, sub
  for (let userId of streamerIds) {
    await axios(webhookSubOptions(tokenOAuth, userId, 'stream.online'))
    await axios(webhookSubOptions(tokenOAuth, userId, 'stream.offline'))
    console.log(`subbing to ${userId}`)
  }

  console.log('subbing complete')
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

// Twitch webhook notification 
function verifySignature(messageSignature, messageID, messageTimestamp, body) {
  let message = messageID + messageTimestamp + body
  let signature = crypto.createHmac('sha256', webhookSecret).update(message) // Remember to use the same secret set at creation
  let expectedSignatureHeader = "sha256=" + signature.digest("hex")

  return expectedSignatureHeader === messageSignature
}

app.post('/subResponse', async (req, res) => {
  if (!verifySignature(req.header("Twitch-Eventsub-Message-Signature"),
    req.header("Twitch-Eventsub-Message-Id"),
    req.header("Twitch-Eventsub-Message-Timestamp"),
    req.rawBody)) {
      res.status(403).send("Forbidden") // Reject requests with invalid signatures
  } else {
    if (req.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
      console.log(req.body.challenge)
      res.send(req.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow
    } else if (req.header("Twitch-Eventsub-Message-Type") === "notification") {
      // Implement your own use case with the event data at this block
      if (req.body.subscription && (req.body.subscription.type === 'stream.online' || req.body.subscription.type === 'stream.offline')) {
        console.log(`received stream change type ${req.body.subscription.type} for user: ${req.body.event.broadcaster_user_name}`)
      }

      res.send("") // Default .send is a 200 status
    }
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
