import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const details = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`)
        .join('; ');
      res.status(400).json({
        success: false,
        message: details || 'Validation failed',
        errors: fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
