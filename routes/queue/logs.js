// routes/queue/logs.js
const express = require('express');
const router = express.Router();
const expressWs = require('express-ws');
expressWs(router);

const activeSockets = new Map(); // { agentId: ws }

router.ws('/', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1]);
  const agentId = params.get('agentId');

  if (!agentId) {
    ws.send(JSON.stringify({ error: 'Missing agentId in WebSocket connection' }));
    ws.close();
    return;
  }

  console.log(`📡 WebSocket connected for agent ${agentId}`);
  activeSockets.set(agentId, ws);

  ws.on('close', () => {
    console.log(`🔌 WebSocket closed for agent ${agentId}`);
    activeSockets.delete(agentId);
  });
});

function sendAgentLog(agentId, message) {
  const ws = activeSockets.get(agentId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ log: message }));
  }
}

module.exports = { router, sendAgentLog };
