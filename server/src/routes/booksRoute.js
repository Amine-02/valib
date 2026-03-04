import { Router } from 'express';
import {
  createBookHandler,
  deleteBookHandler,
  generateBookReviewHandler,
  generateBookSummaryHandler,
  getBooksCountHandler,
  getBookByIdHandler,
  getBooksHandler,
  checkInBookHandler,
  checkOutBookHandler,
  updateBookHandler,
} from '../controllers/booksController.js';

const router = Router();

router.get('/', getBooksHandler);
router.get('/count', getBooksCountHandler);
router.get('/:id', getBookByIdHandler);
router.post('/', createBookHandler);
router.patch('/:id', updateBookHandler);
router.delete('/:id', deleteBookHandler);
router.post('/:id/checkout', checkOutBookHandler);
router.post('/:id/checkin', checkInBookHandler);
router.post('/:id/ai-summary', generateBookSummaryHandler);
router.post('/:id/ai-review', generateBookReviewHandler);

export default router;
