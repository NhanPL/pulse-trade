import { registerRequestSchema } from "@pulse-trade/contracts";
import { z } from "zod";

export const registerFormSchema = registerRequestSchema
  .extend({
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
