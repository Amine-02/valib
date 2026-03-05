import { Router } from 'express';
import {
  getCurrentSessionProfileHandler,
  purgeUnauthorizedSelfHandler,
} from '../controllers/authController.js';

const router = Router();

router.get('/me', getCurrentSessionProfileHandler);
router.post('/purge-unauthorized-self', purgeUnauthorizedSelfHandler);

export default router;
