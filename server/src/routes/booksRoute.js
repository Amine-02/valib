import { Router } from 'express';
import {
  createBookHandler,
  deleteBookHandler,
  generateBookLanguageHandler,
  generateBookReviewHandler,
  generateBookSummaryHandler,
  getBooksCountHandler,
  getBookByIdHandler,
  getBooksHandler,
  checkInBookHandler,
  checkOutBookHandler,
  updateBookHandler,
} from '../controllers/booksController.js';
import { requireRoles } from '../middlewares/access.js';

const router = Router();

router.get('/', getBooksHandler);
router.get('/count', getBooksCountHandler);
router.get('/:id', getBookByIdHandler);
router.post('/', requireRoles('admin', 'staff'), createBookHandler);
router.patch('/:id', requireRoles('admin', 'staff'), updateBookHandler);
router.delete('/:id', requireRoles('admin', 'staff'), deleteBookHandler);
router.post(
  '/:id/checkout',
  requireRoles('admin', 'staff'),
  checkOutBookHandler
);
router.post('/:id/checkin', requireRoles('admin', 'staff'), checkInBookHandler);
router.post('/:id/ai-summary', generateBookSummaryHandler);
router.post('/:id/ai-review', generateBookReviewHandler);
router.post('/:id/ai-language', generateBookLanguageHandler);

export default router;
