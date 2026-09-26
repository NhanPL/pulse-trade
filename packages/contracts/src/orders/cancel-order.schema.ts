import { z } from "zod";

export const cancelOrderParamsSchema = z.strictObject({ id: z.uuid() });

export const cancelOrderResponseSchema = z.object({
  data: z.object({
    cancelledAt: z.iso.datetime(),
    id: z.uuid(),
    status: z.literal("CANCELLED"),
  }),
});

export type CancelOrderParams = z.infer<typeof cancelOrderParamsSchema>;
export type CancelOrderResponse = z.infer<typeof cancelOrderResponseSchema>;
