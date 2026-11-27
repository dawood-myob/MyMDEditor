import { z } from 'zod';
import { errors } from './errors.js';
import { UUID_RE } from './ids.js';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw errors.validation(
      'Invalid request',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export const zId = z.string().regex(UUID_RE, 'must be a UUID');
export const idParams = z.object({ id: z.string().max(64) });
