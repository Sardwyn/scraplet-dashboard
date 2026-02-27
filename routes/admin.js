import express from 'express';
import { generatePrometheusMetrics } from '../utils/metrics.js';

const router = express.Router();

function authorize(req, res, next) {
  const token = process.env.ADMIN_METRICS_TOKEN;
  if (!token) {
    return res.status(503).send('Metrics token not configured');
  }

  const provided = req.get('x-admin-token') || req.query.token;
  if (provided !== token) {
    return res.status(401).send('Unauthorized');
  }

  return next();
}

router.get('/metrics', authorize, (req, res) => {
  const body = generatePrometheusMetrics();
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(body);
});

export default router;
