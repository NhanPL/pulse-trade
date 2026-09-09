import { z } from "zod";

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(ql)?:/.test(value))
    .optional(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;
