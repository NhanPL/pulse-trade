import { z } from "zod";

export const decimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const unsignedDecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export type DecimalString = z.infer<typeof decimalStringSchema>;
export type UnsignedDecimalString = z.infer<typeof unsignedDecimalStringSchema>;
