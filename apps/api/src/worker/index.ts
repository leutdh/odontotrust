import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv } from '../config/env';

const env = loadEnv();
// BullMQ requires maxRetriesPerRequest: null on the connection used by workers.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('default', { connection });

connection.on('ready', () => console.log('worker connected to redis (no jobs registered yet)'));
connection.on('error', (err) => console.error('redis error:', err.message));

const shutdown = async () => {
  await queue.close();
  connection.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
