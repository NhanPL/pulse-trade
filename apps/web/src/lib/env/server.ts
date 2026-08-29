import { z } from "zod";

const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:3001/api/v1"),
  NEXT_PUBLIC_WS_URL: z.url().default("ws://localhost:3001/realtime"),
});

const result = webEnvironmentSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
});

if (!result.success) {
  const issues = z.prettifyError(result.error);

  throw new Error(`Invalid web environment configuration:\n${issues}`);
}

export const webEnvironment = Object.freeze(result.data);
