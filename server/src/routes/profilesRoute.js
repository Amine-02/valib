import { Router } from 'express';
import {
  createProfileHandler,
  deleteProfileHandler,
  getProfileByIdHandler,
  getProfilesCountHandler,
  getProfilesHandler,
  inviteProfileHandler,
  purgeUnauthorizedSelfHandler,
  updateProfileHandler,
} from '../controllers/profilesController.js';

const router = Router();

router.get('/', getProfilesHandler);
router.get('/count', getProfilesCountHandler);
router.post('/invite', inviteProfileHandler);
router.post('/purge-unauthorized-self', purgeUnauthorizedSelfHandler);
router.get('/:id', getProfileByIdHandler);
router.post('/', createProfileHandler);
router.patch('/:id', updateProfileHandler);
router.delete('/:id', deleteProfileHandler);

export default router;
