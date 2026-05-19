'use strict';

const { buildApp } = require('./app');
const config = require('./config');

const app = buildApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[source-asia] listening on http://localhost:${config.port}`);
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[source-asia] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  // Hard timeout so we don't hang forever on stuck sockets.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
