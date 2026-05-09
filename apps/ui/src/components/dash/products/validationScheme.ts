import { z } from 'zod';

export const ProductSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(255, 'Máximo 255 caracteres'),
  categoryId: z.string().uuid('Debes seleccionar una categoría'),
  price: z
    .number({ invalid_type_error: 'El precio debe ser un número' })
    .positive('El precio debe ser mayor a 0'),
  stock: z.number().int().nonnegative('El stock no puede ser negativo').nullable().optional(),
  sku: z.string().max(50, 'Máximo 50 caracteres').optional(),
  imageUrl: z
    .string()
    .regex(/^(https?:\/\/.+|\/.+)/, 'La URL de imagen no es válida')
    .nullable()
    .optional(),
  description: z.string().max(500, 'Máximo 500 caracteres').optional(),
  active: z.boolean().optional(),
});
