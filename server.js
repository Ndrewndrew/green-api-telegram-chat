import { fileURLToPath } from 'node:url';
import { createReviewApp } from './server/access.js';

const app = createReviewApp();
export default app;

if (!process.env.VERCEL && process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(Number(process.env.PORT) || 3000, '127.0.0.1');
}
