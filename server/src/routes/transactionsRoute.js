import { Router } from 'express';
import {
  createTransactionHandler,
  getTransactionsCountHandler,
  getTransactionByIdHandler,
  getTransactionsHandler,
  getOverdueBooksHandler,
} from '../controllers/transactionsController.js';

const router = Router();

router.get('/', getTransactionsHandler);
router.get('/count', getTransactionsCountHandler);
router.get('/overdue', getOverdueBooksHandler);
router.get('/:id', getTransactionByIdHandler);
router.post('/', createTransactionHandler);

export default router;
