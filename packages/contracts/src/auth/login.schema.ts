import { z } from "zod";

export const loginRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  password: z.string().min(1).max(128),
});

export const loginResponseSchema = z.object({
  data: z.object({
    user: z.object({ id: z.uuid(), email: z.email() }),
    accessToken: z.string().min(1),
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int().positive(),
    session: z.object({ id: z.uuid(), expiresAt: z.iso.datetime() }),
  }),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
