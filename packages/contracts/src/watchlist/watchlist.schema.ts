import { z } from "zod";

const marketSymbolSchema = z
  .string()
  .regex(/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/)
  .max(41);

export const watchlistAddRequestSchema = z.strictObject({ symbol: marketSymbolSchema });
export const watchlistRemoveParamsSchema = z.strictObject({ symbol: marketSymbolSchema });

export const watchlistItemSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
  symbol: marketSymbolSchema,
});

export const watchlistListResponseSchema = z.strictObject({
  data: z.strictObject({ items: z.array(watchlistItemSchema) }),
});
export const watchlistAddResponseSchema = z.strictObject({ data: watchlistItemSchema });

export type WatchlistAddRequest = z.infer<typeof watchlistAddRequestSchema>;
export type WatchlistRemoveParams = z.infer<typeof watchlistRemoveParamsSchema>;
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type WatchlistListResponse = z.infer<typeof watchlistListResponseSchema>;
export type WatchlistAddResponse = z.infer<typeof watchlistAddResponseSchema>;
