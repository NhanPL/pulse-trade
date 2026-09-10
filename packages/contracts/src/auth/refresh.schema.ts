import { z } from "zod";
import { loginResponseSchema } from "./login.schema.js";

// Authentication comes exclusively from the HttpOnly cookie, never a JSON token/user ID.
export const refreshRequestSchema = z.strictObject({}).optional();
export const refreshResponseSchema = loginResponseSchema;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
