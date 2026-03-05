import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import booksRoutes from './routes/booksRoute.js';
import transactionsRoutes from './routes/transactionsRoute.js';
import profilesRoutes from './routes/profilesRoute.js';
import authRoutes from './routes/authRoute.js';
import { requireUserRole } from './middlewares/requireUserRole.js';

const app = express();
const port = process.env.PORT || 8080;
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '50mb' }));

const api = express.Router();
api.use(requireUserRole);
api.use('/auth', authRoutes);
api.use('/books', booksRoutes);
api.use('/transactions', transactionsRoutes);
api.use('/profiles', profilesRoutes);
app.use('/api', api);
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
