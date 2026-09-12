import type { QueryClient, QueryKey } from "@tanstack/react-query";

const privateQueryScopes = ["auth", "portfolio", "orders", "watchlist"] as const;

export function isPrivateQueryKey(queryKey: QueryKey): boolean {
  const scope = queryKey[0];
  return (
    typeof scope === "string" && privateQueryScopes.some((privateScope) => privateScope === scope)
  );
}

export function clearPrivateQueryCache(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (query) => isPrivateQueryKey(query.queryKey),
  });
}
