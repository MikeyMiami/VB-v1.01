
const express = require('express');
const app = express();
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');

dotenv.config();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Voicebot backend is live and running.');
});

app.use('/routes', require('./routes/test-ai'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔗 New WebSocket connection established');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
