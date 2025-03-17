import { Router } from 'express';
import { createSubCategory, deleteSubCategory, getAllSubCategory, getSubCategory, updateSubCategory } from 'src/controllers/sub-categories/sub-categories-controller';

const router = Router();

router.post('/', createSubCategory);
router.get('/', getAllSubCategory);
router.get('/:id', getSubCategory);
router.put('/:id', updateSubCategory);
router.delete('/:id', deleteSubCategory);

export { router }