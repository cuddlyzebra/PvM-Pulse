const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

/**
 * Serves the OBS-facing overlay page and pushes ability-cast events to it
 * live over WebSocket. This replaces the original tracker's approach of
 * repeatedly writing a PNG to disk and having OBS's Browser Source poll a
 * local HTML file for changes — that worked, but adds polling lag and
 * flicker. Pushing events means the overlay updates the instant a key is
 * pressed, with the animation handled client-side in overlay/overlay.js.
 */
function startOverlayServer({ port }) {
  const app = express();
  app.use('/data', express.static(path.join(__dirname, '..', 'data')));
  app.use(express.static(path.join(__dirname, '..', 'overlay')));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const sockets = new Set();
  wss.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  function broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(message);
    }
  }

  server.listen(port, '127.0.0.1');

  return {
    overlayUrl: `http://127.0.0.1:${port}/index.html`,
    broadcastCast: (event) => broadcast({ type: 'cast', event }),
    broadcastProfileMeta: (settings) => broadcast({ type: 'settings', settings }),
    stop: () => {
      wss.close();
      server.close();
    }
  };
}

module.exports = { startOverlayServer };
