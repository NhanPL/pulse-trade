export const watchlistQueryKeys = {
  all: ["watchlist"] as const,
  list: (userId: string | null) => ["watchlist", userId, "list"] as const,
  mutations: (userId: string | null) => ["watchlist", userId, "toggle"] as const,
  toggle: (userId: string | null, symbol: string) =>
    ["watchlist", userId, "toggle", symbol] as const,
};
