import { z } from 'zod';

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .trim()
    .min(min, `${label} debe tener al menos ${min} caracteres`)
    .max(max, `${label} admite hasta ${max} caracteres`);

export const addressSchema = z.object({
  recipient: trimmed(2, 80, 'El destinatario'),
  line1: trimmed(3, 120, 'La dirección'),
  line2: z.string().trim().max(120).optional(),
  city: trimmed(2, 80, 'La ciudad'),
  region: trimmed(2, 80, 'La provincia/estado'),
  postalCode: trimmed(2, 12, 'El código postal'),
  country: z
    .string()
    .trim()
    .length(2, 'Usá el código de país de 2 letras (p. ej. AR)')
    .transform((c) => c.toUpperCase()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{6,20}$/, 'Teléfono inválido'),
});

export const emailSchema = z
  .string({ error: 'El email es obligatorio' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Email inválido'));

export const passwordSchema = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200, 'La contraseña es demasiado larga');

export const registerRequestSchema = z.object({
  name: trimmed(2, 80, 'El nombre'),
  email: emailSchema,
  password: passwordSchema,
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
});

export const updateProfileRequestSchema = z
  .object({
    name: trimmed(2, 80, 'El nombre').optional(),
    defaultAddress: addressSchema.nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.defaultAddress !== undefined, 'No hay cambios para guardar');

export const roleSchema = z.enum(['customer', 'admin']);

export const profileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  defaultAddress: addressSchema.nullable(),
});

export type Address = z.infer<typeof addressSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Profile = z.infer<typeof profileSchema>;
