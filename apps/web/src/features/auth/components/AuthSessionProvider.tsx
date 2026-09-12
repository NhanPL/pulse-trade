"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LoginResponse, MeResponse } from "@pulse-trade/contracts";

import { bootstrapSession } from "../api/bootstrap";
import { logoutUser } from "../api/logout";
import { clearPrivateQueryCache } from "../model/private-query-cache";
import { authQueryKeys } from "../model/query-keys";

export type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "unavailable";

type AuthSession = {
  acceptLogin(data: LoginResponse["data"]): void;
  getAccessToken(): string | null;
  isLoggingOut: boolean;
  logout(): Promise<void>;
  logoutError: string | null;
  retry(): void;
  status: AuthStatus;
  user: MeResponse["data"]["user"] | null;
  waitForBootstrap(): Promise<void>;
};
const AuthSessionContext = createContext<AuthSession | null>(null);

type AuthState = {
  expiresAt: number | null;
  isLoggingOut: boolean;
  logoutError: string | null;
  status: AuthStatus;
  user: MeResponse["data"]["user"] | null;
};

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Provider-local memory avoids persistent credential storage and cross-request SSR state.
  const credential = useRef<{ token: string; expiresAt: number } | null>(null);
  const bootstrap = useRef<Promise<void> | null>(null);
  const logoutOperation = useRef<Promise<void> | null>(null);
  const hasLoggedOut = useRef(false);
  const hasStarted = useRef(false);
  const isMounted = useRef(false);
  const [state, setState] = useState<AuthState>({
    status: "checking",
    user: null,
    expiresAt: null,
    isLoggingOut: false,
    logoutError: null,
  });

  const clearCredential = useCallback(() => {
    credential.current = null;
    queryClient.removeQueries({ queryKey: authQueryKeys.me, exact: true });
  }, [queryClient]);

  const getAccessToken = useCallback((): string | null => {
    const current = credential.current;
    if (!current || current.expiresAt <= Date.now()) {
      credential.current = null;
      return null;
    }
    return current.token;
  }, []);

  const acceptSession = useCallback(
    (data: LoginResponse["data"], user = data.user) => {
      const expiresAt = Math.min(
        Date.now() + data.expiresIn * 1000,
        Date.parse(data.session.expiresAt),
      );
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        clearCredential();
        if (isMounted.current) {
          setState({
            status: "unauthenticated",
            user: null,
            expiresAt: null,
            isLoggingOut: false,
            logoutError: null,
          });
        }
        return;
      }
      hasLoggedOut.current = false;
      credential.current = { token: data.accessToken, expiresAt };
      queryClient.setQueryData(authQueryKeys.me, user);
      if (isMounted.current) {
        setState({
          status: "authenticated",
          user,
          expiresAt,
          // Keep the action disabled when this refresh completed just before logout revokes it.
          isLoggingOut: logoutOperation.current !== null,
          logoutError: null,
        });
      }
    },
    [clearCredential, queryClient],
  );

  const runBootstrap = useCallback((): Promise<void> => {
    // A completed explicit logout must not be undone by a late refresh timer.
    if (hasLoggedOut.current) return Promise.resolve();
    if (logoutOperation.current) return logoutOperation.current;
    if (bootstrap.current) return bootstrap.current;
    const task = (async () => {
      if (isMounted.current) {
        setState((current) =>
          current.status === "authenticated" ? current : { ...current, status: "checking" },
        );
      }
      const result = await bootstrapSession();
      if (result.kind === "authenticated") {
        acceptSession(result.session, result.user);
        return;
      }
      clearCredential();
      if (isMounted.current) {
        setState({
          status: result.kind,
          user: null,
          expiresAt: null,
          isLoggingOut: false,
          logoutError: null,
        });
      }
    })();
    bootstrap.current = task;
    void task.finally(() => {
      if (bootstrap.current === task) bootstrap.current = null;
    });
    return task;
  }, [acceptSession, clearCredential]);

  useEffect(() => {
    isMounted.current = true;
    // Do not abort or duplicate this request in React Strict Mode: refresh rotates its cookie.
    if (!hasStarted.current) {
      hasStarted.current = true;
      void runBootstrap();
    }
    return () => {
      isMounted.current = false;
    };
  }, [runBootstrap]);

  useEffect(() => {
    if (state.status !== "authenticated" || !state.expiresAt) return;
    // Refresh before access-token expiry; runBootstrap serializes the cookie rotation.
    const delay = Math.max(1_000, Math.floor((state.expiresAt - Date.now()) * 0.8));
    const timer = window.setTimeout(() => {
      void runBootstrap();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [runBootstrap, state.expiresAt, state.status]);

  const logout = useCallback((): Promise<void> => {
    if (logoutOperation.current) return logoutOperation.current;

    const task = (async () => {
      if (isMounted.current) {
        setState((current) => ({ ...current, isLoggingOut: true, logoutError: null }));
      }

      try {
        // Refresh rotates the cookie, so finish it before asking the API to revoke this session.
        await (bootstrap.current ?? Promise.resolve());
        await logoutUser(getAccessToken());
      } catch (error) {
        if (isMounted.current) {
          setState((current) => ({
            ...current,
            isLoggingOut: false,
            logoutError:
              error instanceof Error
                ? error.message
                : "Sign-out is temporarily unavailable. Please try again shortly.",
          }));
        }
        return;
      }

      hasLoggedOut.current = true;
      credential.current = null;
      clearPrivateQueryCache(queryClient);
      if (isMounted.current) {
        setState({
          status: "unauthenticated",
          user: null,
          expiresAt: null,
          isLoggingOut: false,
          logoutError: null,
        });
      }
    })();
    logoutOperation.current = task;
    void task.finally(() => {
      if (logoutOperation.current === task) logoutOperation.current = null;
    });
    return task;
  }, [getAccessToken, queryClient]);

  const session = useMemo<AuthSession>(
    () => ({
      acceptLogin(data) {
        acceptSession(data);
      },
      getAccessToken,
      isLoggingOut: state.isLoggingOut,
      logout,
      logoutError: state.logoutError,
      retry() {
        void runBootstrap();
      },
      status: state.status,
      user: state.user,
      waitForBootstrap() {
        return bootstrap.current ?? Promise.resolve();
      },
    }),
    [acceptSession, getAccessToken, logout, runBootstrap, state],
  );
  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error("AuthSessionProvider is required.");
  return session;
}
