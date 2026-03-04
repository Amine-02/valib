import { Router } from 'express';
import {
  createTransactionHandler,
  getTransactionByIdHandler,
  getTransactionsHandler,
} from '../controllers/transactionsController.js';

const router = Router();

router.get('/', getTransactionsHandler);
router.get('/:id', getTransactionByIdHandler);
router.post('/', createTransactionHandler);

export default router;
