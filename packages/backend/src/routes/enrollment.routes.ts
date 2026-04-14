import { Router } from 'express';
import { EnrollmentRequestSchema, ShapeEnrollmentRequestSchema } from '@chicken-scratch/shared';
import { validate } from '../middleware/validate.js';
import { enrollSample, enrollShape, getEnrollmentStatus } from '../services/enrollment.service.js';

const router = Router();

router.post('/api/enroll', validate(EnrollmentRequestSchema), (req, res) => {
  const { username, signatureData } = req.body;
  const result = enrollSample(username, signatureData);
  const status = result.success ? 200 : 400;
  res.status(status).json(result);
});

router.post('/api/enroll/shape', validate(ShapeEnrollmentRequestSchema), (req, res) => {
  const { username, shapeType, signatureData } = req.body;
  const result = enrollShape(username, shapeType, signatureData);
  const status = result.success ? 200 : 400;
  res.status(status).json(result);
});

router.get('/api/enroll/:username/status', (req, res) => {
  const result = getEnrollmentStatus(req.params.username);
  res.json(result);
});

export default router;
