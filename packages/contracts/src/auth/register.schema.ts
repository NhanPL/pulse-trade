import { z } from "zod";

export const registerRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  password: z.string().min(8).max(128),
});

export const registerResponseSchema = z.object({
  data: z.object({
    user: z.object({ id: z.uuid(), email: z.email() }),
  }),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
