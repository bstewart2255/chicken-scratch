import { Router } from 'express';
import { EnrollmentRequestSchema, ShapeEnrollmentRequestSchema } from '@chicken-scratch/shared';
import { validate } from '../middleware/validate.js';
import { enrollSample, enrollShape, getEnrollmentStatus } from '../services/enrollment.service.js';

const router = Router();

router.post('/api/enroll', validate(EnrollmentRequestSchema), async (req, res, next) => {
  try {
    const { username, signatureData } = req.body;
    const result = await enrollSample(username, signatureData);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/api/enroll/shape', validate(ShapeEnrollmentRequestSchema), async (req, res, next) => {
  try {
    const { username, shapeType, signatureData } = req.body;
    const result = await enrollShape(username, shapeType, signatureData);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/api/enroll/:username/status', async (req, res, next) => {
  try {
    const result = await getEnrollmentStatus(req.params.username);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
