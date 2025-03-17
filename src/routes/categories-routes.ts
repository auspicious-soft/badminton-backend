import { Router } from 'express';
import { createCategory, deleteCategory, getAllCategories, getCategory, updateCategory } from 'src/controllers/categories/categories-controller';

const router = Router();

// Categories routes
router.post('/', createCategory);
router.get('/', getAllCategories);
router.get('/:id', getCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export { router }