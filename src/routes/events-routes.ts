import { Router } from 'express';
import { createEventHandler, getEventByIdHandler, updateEventHandler, deleteEventHandler, getAllEventsHandler } from '../controllers/events/events-controller';


const router = Router();

router.post('/', createEventHandler);
router.get('/', getAllEventsHandler);
router.get('/:id', getEventByIdHandler);
router.put('/:id', updateEventHandler);
router.delete('/:id', deleteEventHandler);

export { router }