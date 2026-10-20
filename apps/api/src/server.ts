import { createApp } from './app.js';
import { DEFAULT_PORT } from './constants.js';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const app = createApp();
try {
  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
} catch (error) {
  app.log.error({ err: error }, 'Failed to start API');
  process.exitCode = 1;
}
