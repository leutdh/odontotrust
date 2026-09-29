import { loadEnv } from '../config/env';
import { createApp } from './app';

const env = loadEnv();
createApp(env).listen(env.API_PORT, () => {
  console.log(`api listening on :${env.API_PORT}`);
});
