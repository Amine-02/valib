import 'dotenv/config';
import cors from 'cors';
import express from 'express';
// import booksRoutes from './routes/booksRoutes.js';

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const api = express.Router();

api.get('/', (req, res) => {
  res.json({ message: 'Valib API is running' });
});

api.get('/health', (req, res) => {
  res.json({ ok: true });
});

// api.use('/books', booksRoutes);

app.use('/api', api);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
