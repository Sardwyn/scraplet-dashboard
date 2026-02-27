import express from 'express';
import { widgets, getWidgetById } from '../utils/mockData.js';

const router = express.Router();

// GET /dashboard/widgets/:id/configure
router.get('/:id/configure', (req, res) => {
  const widget = getWidgetById(req.params.id);
  if (!widget) return res.status(404).send('Widget not found');
  res.render('widget-configure', { widget, user: req.session?.user });
});

export default router;
