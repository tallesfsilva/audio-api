// src/modules/transcriptions/routes/transcriptions.routes.ts
import { Router } from 'express';
import { transcriptionsController } from '../transcription/controller/transcriptions.controller';
import { authenticate } from  '../../shared/guards/authenticate'

const router = Router();

router.use(authenticate);

router.post('/', transcriptionsController.create);
router.get('/', transcriptionsController.list);
router.get('/search/library', transcriptionsController.searchLibrary);
router.get('/job/:jobId', transcriptionsController.getByJobId);
router.get('/:id', transcriptionsController.getById);
router.get('/:id/segments', transcriptionsController.getWithSegments);
router.get('/:id/quotes', transcriptionsController.getQuotes);
router.post('/:id/quotes', transcriptionsController.addQuotes);
router.post('/:id/translate', transcriptionsController.translate);
router.get('/:id/search', transcriptionsController.searchDialogue);
router.patch('/:id', transcriptionsController.update);
router.delete('/:id', transcriptionsController.delete);

export { router as transcriptionsRouter };
