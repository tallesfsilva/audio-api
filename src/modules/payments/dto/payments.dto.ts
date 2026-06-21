// src/modules/payments/dto/payments.dto.ts
import { z } from 'zod';

export const CreateCheckoutSchema = z.object({
  tier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']),
  // Optional: let the user specify their own success/cancel URLs
  successUrl: z.string().url().optional(),
  cancelUrl:  z.string().url().optional(),
});

export const CreatePortalSchema = z.object({
  returnUrl: z.string().url().optional(),
});

export type CreateCheckoutDto = z.infer<typeof CreateCheckoutSchema>;
export type CreatePortalDto   = z.infer<typeof CreatePortalSchema>;
