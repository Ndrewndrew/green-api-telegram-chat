import { fileURLToPath } from 'node:url';
import express from 'express';
import { createReviewApp } from './server/access.js';

const app = express();
createReviewApp({ app });
export default app;

if (!process.env.VERCEL && process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(Number(process.env.PORT) || 3000, '127.0.0.1');
}
