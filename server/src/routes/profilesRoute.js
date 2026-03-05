import { Router } from 'express';
import {
  createProfileHandler,
  deleteProfileHandler,
  getProfileByIdHandler,
  getProfilesCountHandler,
  getProfilesHandler,
  inviteProfileHandler,
  updateProfileHandler,
} from '../controllers/profilesController.js';
import { requireRoles } from '../middlewares/access.js';

const router = Router();

router.get('/count', requireRoles('admin', 'staff'), getProfilesCountHandler);
router.get('/', requireRoles('admin'), getProfilesHandler);
router.post('/invite', requireRoles('admin'), inviteProfileHandler);
router.get('/:id', requireRoles('admin'), getProfileByIdHandler);
router.post('/', requireRoles('admin'), createProfileHandler);
router.patch('/:id', requireRoles('admin'), updateProfileHandler);
router.delete('/:id', requireRoles('admin'), deleteProfileHandler);

export default router;
