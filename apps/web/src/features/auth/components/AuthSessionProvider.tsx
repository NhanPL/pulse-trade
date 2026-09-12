"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LoginResponse } from "@pulse-trade/contracts";

import { authQueryKeys } from "../model/query-keys";

type AuthSession = {
  acceptLogin(data: LoginResponse["data"]): void;
  getAccessToken(): string | null;
};
const AuthSessionContext = createContext<AuthSession | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Provider-local memory avoids persistent credential storage and cross-request SSR state.
  const credential = useRef<{ token: string; expiresAt: number } | null>(null);
  const session = useMemo<AuthSession>(
    () => ({
      acceptLogin(data) {
        credential.current = {
          token: data.accessToken,
          expiresAt: Math.min(
            Date.now() + data.expiresIn * 1000,
            Date.parse(data.session.expiresAt),
          ),
        };
        queryClient.setQueryData(authQueryKeys.me, data.user);
      },
      getAccessToken() {
        const current = credential.current;
        if (!current || current.expiresAt <= Date.now()) {
          credential.current = null;
          return null;
        }
        return current.token;
      },
    }),
    [queryClient],
  );
  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error("AuthSessionProvider is required.");
  return session;
}
