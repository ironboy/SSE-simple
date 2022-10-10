const port = 4800;
const debug = false;
const serveTestFrontend = true;
const cors = require('cors');
const express = require('express');
const app = express();

app.use(cors());
app.use(express.json({ limit: '1KB' }));
serveTestFrontend && app.use(express.static('test-frontend'));
app.use((error, req, res, next) => 
  error ? res.send({ error }) : next()
);

const sleep = ms => new Promise(res => setTimeout(res, ms));
const channels = {};

app.get('/api/channel/create/:channel', async (req, res) => {
  try {
    let { channel } = req.params;
    if (channels[channel]) {
      res.json({ error: `Channel '${channel}' already exists. Can not create.` });
    }
    else {
      channels[channel] = {};
      res.json({ success: `Channel '${channel}' created. Join within 30 seconds!` });
      await sleep(30000);
      if (!Object.keys(channels[channel]).length) {
        delete channels[channel];
      }
    }
  } catch (e) { debugError(e); }
});

const startListener = async (req, res) => {
  try {
    let { channel, user, historyItems } = req.params;
    res.header({
      'Connection': 'keep-alive',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    });
    if (user === 'system') {
      errorInSSE(res, `Forbidden username 'system'.`);
      return
    }
    if (!channels[channel]) {
      errorInSSE(res, `No channel '${channel}' exists.`);
      return;
    }
    let channelName = channel;
    channel = channels[channel];
    channel.users = channel.users || {};
    if (channel.users[user]) {
      errorInSSE(res, `User '${user}' already exists in '${channelName}' . Can not join/listen!`);
      return;
    }
    channel.users[user] = { req, res };
    req.on('close', async () => {
      delete channel.users[user];
      send(channelName, 'system', `User '${user}' left channel '${channelName}'.`);
      await sleep(30000);
      if (!Object.keys(channel.users).length) {
        // Delete channel if no users left
        delete channels[channelName];
      }
    });
    await sleep(100);
    if (historyItems && !isNaN(historyItems) && channel.history) {
      for (item of channel.history.slice().splice(-historyItems)) {
        res.write(item);
      }
    }
    send(channelName, 'system', `User ${user} joined channel '${channelName}'.`);
  }
  catch (e) { debugError(e); }
}

app.get('/api/channel/listen/:channel/:user/:historyItems', startListener);
app.get('/api/channel/listen/:channel/:user', startListener);

app.post('/api/send-message/:channel/:user', (req, res) => {
  try {
    let { channel, user } = req.params;
    if (!channels[channel]) {
      res.json({ error: `No channel '${channel}' exists.` });
      return;
    }
    if (!channels[channel].users[user]) {
      res.json({ error: `User ${user} does not exist in channel {channel}. Can not send message!` });
      return;
    }
    send(channel, user, req.body.message);
    res.json({ success: 'Sent message.' });
  }
  catch (e) { debugError(e); }
});

function send(channel, user, data) {
  try {
    if (!channels[channel] || !channels[channel].users) { return; }
    let message = { timestamp: new Date().toISOString(), user, data };
    for (let { req, res } of Object.values(channels[channel].users)) {
      let toWrite = `event: message\n` +
        `data: ${JSON.stringify(message)}\n\n`;
      res.write(toWrite);
      let c = channels[channel].history = channels[channel].history || [];
      c.push(toWrite);
      while (c.length > 100) { c.shift(); } // max 100 items in history
    }
  }
  catch (e) { debugError(e); }
}

function errorInSSE(res, error) {
  try {
    res.write(
      `event: error\n` +
      `data: ${JSON.stringify(error)}\n\n`
    );
    res.end();
  }
  catch (e) { debugError(e); }
}

function debugError(error) {
  debug && console.log(error);
}

app.listen(port, () => console.log('Listening on port ' + port));