// Settings
const port = 4800;
const debug = true;
const serveTestFrontend = true;

// Import dependencies
const cors = require('cors');
const express = require('express');

// Create app and add middleware
const app = express();
app.use(cors());
app.use(express.json({ limit: '10KB' }));
serveTestFrontend && app.use(express.static('test-frontend'));
app.use((error, req, res, next) => error ? res.send({ error }) : next());

// Async sleep
const sleep = ms => new Promise(res => setTimeout(res, ms));

// Memory for channels and tokens (idenfifiers for users)
const channels = {};
const tokens = {}

// Start listening to or create a chennel
// /api/listen/:channelName/:userName
// /api/listen/:channelName/:userName/:newerThan
app.get('/api/listen/:channelName/:userName/:newerThan', startListener);
app.get('/api/listen/:channelName/:userName', startListener);
async function startListener(req, res) {
  try {
    let { channelName, userName, newerThan } = req.params;
    res.header({
      'Connection': 'keep-alive',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    });
    // Username 'system' is reserved for the system
    if (userName === 'system') {
      sendError(res, `Forbidden username 'system'.`);
      return
    }
    // Create channel if it does not exist
    if (!channels[channelName]) {
      channels[channelName] = { users: {}, history: [] }
      broadcast(channelName, 'system', `User '${userName}' created the channel '${channelName}'.`);
    }
    let channel = channels[channelName];
    // If a user with the name is already connected do not allow
    if (channel.users[userName]) {
      sendError(res, `User '${userName}' already exists in '${channelName}' . Can not join/listen!`);
      return;
    }
    // Add user
    channel.users[userName] = res;
    let token = [...new Array(8)].map(x => String
      .fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    tokens[token] = { channelName, userName };
    writer(res, `event: token\ndata: ${JSON.stringify(token)}\n\n`);
    broadcast(channelName, 'system', `User ${userName} joined channel '${channelName}'.`);
    // Send history items if asked for
    console.log(userName, channelName, newerThan, channel.history)
    newerThan !== undefined && !isNaN(newerThan) && channel.history
      .filter(({ timestamp }) => timestamp > +newerThan)
      .forEach(({ rawMessage }) => {
        console.log('writing to ', userName, rawMessage);
        writer(res, rawMessage)
      });
    // On connection close delete user
    req.on('close', async () => {
      delete channel.users[userName];
      delete tokens[token];
      broadcast(channelName, 'system', `User '${userName}' left channel '${channelName}'.`);
      // Delete channel if no users left (wait 30 seconds and check once more)
      if (!Object.keys(channel.users).length) {
        await sleep(30000);
        !Object.keys(channel.users).length && delete channels[channelName];
      }
    });
  }
  catch (e) { debugError(e); }
}

// Send a message
app.post('/api/send/:token', (req, res) => {
  try {
    let { token } = req.params;
    let { channelName, userName } = (tokens[token] || {});
    if (!channels[channelName]?.users?.[userName]) {
      res.json({ error: `Invalid token. Can not send message!` });
      return;
    }
    broadcast(channelName, userName, req.body.message);
    res.json({ success: 'Sent message.' });
  }
  catch (e) { debugError(e); }
});

// Broadcast - send to everyone in a channel
function broadcast(channelName, fromUser, data, delayed) {
  // Move to next tick in event loop
  if (!delayed) {
    setTimeout(() => broadcast(channelName, fromUser, data, true), 0);
    return;
  }
  // Broadcast message
  try {
    if (!channels[channelName]?.users) { return; }
    let message = `event: message\ndata: ${JSON.stringify({
      timestamp: Date.now(), user: fromUser, data
    })}\n\n`;
    // Send to everyone
    for (let res of Object.values(channels[channelName].users)) {
      writer(res, message);
    }
    // Add to history and keep history at max 100 items
    let c = channels[channelName].history
    c.push({ timestamp: Date.now(), rawMessage: message });
    c.splice(100, Infinity);
  }
  catch (e) { debugError(e); }
}

// Keep alive message/comment send every 15:th second on every channel
async function keepAlive() {
  for (let channelName of Object.keys(channels)) {
    for (let res of Object.values(channels[channelName].users)) {
      writer(res, ':keepalive\n\n');
    }
  }
  await sleep(15000);
  keepAlive();
}

// Write to response object
timeoutSettings = [];
function writer(res, data) {
  timeoutSettings.push(res);
  let ms = timeoutSettings.filter(x => x === res).length * 10;
  setTimeout(() => {
    res.write(data);
    let i = timeoutSettings.find(x => x === res);
    if (i >= 0) { timeoutSettings.splice(i, 1); }
  }, ms);
}

// Error reporting
function sendError(res, error) {
  try {
    writer(res, `event: error\ndata: ${JSON.stringify(error)}\n\n`);
    res.end();
  }
  catch (e) { debugError(e); }
}

// Internal error reporting
function debugError(error) {
  debug && console.log(error);
}

// Start Express app + keep alive
app.listen(port, () => console.log('Listening on port ' + port));
keepAlive();