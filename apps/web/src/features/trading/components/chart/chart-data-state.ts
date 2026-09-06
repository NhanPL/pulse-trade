export type ChartDataState = "empty" | "error" | "loading" | "ready";

export type ResolveChartDataStateInput = Readonly<{
  candleCount: number | undefined;
  isError: boolean;
  isPending: boolean;
}>;

/** Keeps a last-known chart visible during background refetches while handling initial failures. */
export function resolveChartDataState({
  candleCount,
  isError,
  isPending,
}: ResolveChartDataStateInput): ChartDataState {
  const hasResult = candleCount !== undefined;

  if (!hasResult && isError) return "error";
  if (!hasResult && isPending) return "loading";
  if (candleCount === 0) return "empty";
  return "ready";
}
