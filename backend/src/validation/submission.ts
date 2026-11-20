import { z } from 'zod';

// Fields of a multipart upload always arrive as text, so numbers and booleans are parsed here.

// A missing or blank field means "no value"; anything else must be a number in the range.
function optionalNumber(min: number, max: number) {
  return z.preprocess(
    (value) => (value === undefined || String(value).trim() === '' ? undefined : Number(value)),
    z.number().min(min).max(max).optional(),
  );
}

function optionalText(maxLength: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(maxLength).optional(),
  );
}

// Counted in characters, the way Postgres counts them (in JavaScript an emoji has length 2).
function characterCount(value: string): number {
  return Array.from(value).length;
}

export const submissionSchema = z
  .object({
    id: z.uuid(),
    plantCode: z.string().trim().min(1).max(50),
    personName: z
      .string()
      .trim()
      .refine((value) => characterCount(value) >= 2 && characterCount(value) <= 100, 'Name must be 2-100 characters'),
    // "mh 09 ab-1234" becomes "MH09AB1234". Loose on purpose: a truck with an unusual plate
    // must not be stuck at the gate, and the photo shows the real plate.
    truckNumber: z
      .string()
      .transform((value) => value.toUpperCase().replace(/[\s.-]/g, ''))
      .pipe(z.string().regex(/^[A-Z0-9]{4,12}$/, 'Truck number must be 4-12 letters or digits')),
    latitude: optionalNumber(-90, 90),
    longitude: optionalNumber(-180, 180),
    accuracy: optionalNumber(0, 100_000),
    locationStatus: z.enum(['ok', 'last_known', 'unavailable', 'denied']),
    locationMocked: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    otp: z.string().regex(/^[0-9]{6}$/, 'OTP must be 6 digits'),
    capturedAt: z.iso.datetime({ offset: true }),
    deviceId: optionalText(100),
    appVersion: optionalText(50),
  })
  // Same rule as the database: a position exactly when the status says there is one.
  .refine(
    (s) => {
      const needsPosition = s.locationStatus === 'ok' || s.locationStatus === 'last_known';
      const hasLatitude = s.latitude !== undefined;
      const hasLongitude = s.longitude !== undefined;
      return needsPosition ? hasLatitude && hasLongitude : !hasLatitude && !hasLongitude;
    },
    {
      path: ['locationStatus'],
      error: 'Latitude and longitude are needed for ok and last_known, and must be empty otherwise',
    },
  );

export type SubmissionInput = z.infer<typeof submissionSchema>;

// { personName: 'Name must be 2-100 characters', ... }: the first problem found for each field.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? 'body');
    fields[name] ??= issue.message;
  }
  return fields;
}
