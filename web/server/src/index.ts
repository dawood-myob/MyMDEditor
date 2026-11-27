import { loadConfig } from './config.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { app, prepare } = await createApp(config);
  await prepare();

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    const force = setTimeout(() => {
      app.log.error('forced exit after shutdown timeout');
      process.exit(1);
    }, 15_000);
    force.unref();
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error('fatal: failed to start', err);
  process.exit(1);
});
