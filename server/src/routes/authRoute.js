import { Router } from 'express';
import {
  completeSignupHandler,
  getCurrentSessionProfileHandler,
  purgeUnauthorizedSelfHandler,
} from '../controllers/authController.js';

const router = Router();

router.get('/me', getCurrentSessionProfileHandler);
router.post('/purge-unauthorized-self', purgeUnauthorizedSelfHandler);
router.post('/complete-signup', completeSignupHandler);

export default router;
