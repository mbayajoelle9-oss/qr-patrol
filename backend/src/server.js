const http = require('http');
const config = require('./config');
const { connectDb } = require('./db');
const { createApp } = require('./app');
const { initRealtime } = require('./services/realtime');
const { startScheduler } = require('./jobs/scheduler');

async function main() {
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  startScheduler();
  server.listen(config.port, () => {
    console.log(`[api] QR Patrol à l'écoute sur le port ${config.port} (${config.env})`);
  });

  const shutdown = (sig) => {
    console.log(`[api] ${sig} reçu, arrêt…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[api] démarrage impossible', e);
  process.exit(1);
});
