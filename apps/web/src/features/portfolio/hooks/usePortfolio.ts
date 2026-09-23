import { useQuery } from "@tanstack/react-query";

import { useAuthSession } from "../../auth/components/AuthSessionProvider";
import { fetchPortfolio, PortfolioRequestError } from "../api/portfolio";
import { portfolioQueryKeys } from "../model/query-keys";

export function usePortfolio() {
  const session = useAuthSession();

  return useQuery({
    enabled: session.status === "authenticated",
    queryFn: ({ signal }) => {
      const accessToken = session.getAccessToken();
      if (!accessToken) {
        throw new PortfolioRequestError(
          "UNAUTHENTICATED",
          "Your session has expired. Sign in again to continue.",
        );
      }
      return fetchPortfolio(accessToken, signal);
    },
    queryKey: portfolioQueryKeys.all,
  });
}
