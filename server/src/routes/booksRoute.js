import { Router } from 'express';
import {
  createBookHandler,
  deleteBookHandler,
  getBookByIdHandler,
  getBooksHandler,
  checkInBookHandler,
  checkOutBookHandler,
  updateBookHandler,
} from '../controllers/booksController.js';

const router = Router();

router.get('/', getBooksHandler);
router.get('/:id', getBookByIdHandler);
router.post('/', createBookHandler);
router.patch('/:id', updateBookHandler);
router.delete('/:id', deleteBookHandler);
router.post('/:id/checkout', checkOutBookHandler);
router.post('/:id/checkin', checkInBookHandler);

export default router;
