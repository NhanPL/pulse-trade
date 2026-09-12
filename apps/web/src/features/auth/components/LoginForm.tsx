"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginRequestSchema, type LoginRequest } from "@pulse-trade/contracts";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { loginUser } from "../api/login";
import { safeReturnTo } from "../model/return-to";
import { AuthIcon } from "./AuthIcon";
import { useAuthSession } from "./AuthSessionProvider";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const session = useAuthSession();
  const [showPassword, setShowPassword] = useState(false);
  const [complete, setComplete] = useState(false);
  const submitting = useRef(false);
  const request = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: "", password: "" },
  });
  useEffect(() => () => request.current?.abort(), []);

  const submit = async (values: LoginRequest) => {
    const controller = new AbortController();
    request.current = controller;
    clearErrors("root");
    try {
      // The bootstrap refresh rotates its cookie, so a login must not race it.
      await session.waitForBootstrap();
      if (controller.signal.aborted) return;
      const result = await loginUser(values, controller.signal);
      if (controller.signal.aborted) return;
      session.acceptLogin(result);
      reset();
      setShowPassword(false);
      setComplete(true);
      router.replace(safeReturnTo(returnTo));
    } catch (error) {
      if (!controller.signal.aborted)
        setError("root", {
          message: error instanceof Error ? error.message : "Sign-in failed. Please try again.",
        });
    } finally {
      request.current = null;
    }
  };
  const pending = isSubmitting || complete;

  return (
    <form
      noValidate
      className="space-y-6"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        // Guard before async validation, including keyboard submissions and the navigation gap.
        if (submitting.current || complete) return;
        submitting.current = true;
        void handleSubmit(submit)(event).finally(() => {
          submitting.current = false;
        });
      }}
    >
      <Input
        {...register("email")}
        label="Email"
        type="email"
        aria-required="true"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="name@youremail.com"
        leadingIcon={<AuthIcon name="email" />}
        readOnly={pending}
        error={errors.email ? "Enter a valid email address." : undefined}
        className="h-14 bg-canvas/40"
      />
      <Input
        {...register("password")}
        label="Password"
        type={showPassword ? "text" : "password"}
        aria-required="true"
        autoComplete="current-password"
        placeholder="Enter your password"
        leadingIcon={<AuthIcon name="lock" />}
        readOnly={pending}
        error={errors.password ? "Enter your password (1–128 characters)." : undefined}
        trailingElement={
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
            className="grid size-8 place-items-center rounded hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <AuthIcon name="eye" />
          </button>
        }
        className="h-14 bg-canvas/40"
      />
      {errors.root?.message ? (
        <p
          role="alert"
          className="rounded-lg border border-negative/30 bg-negative-subtle p-3 text-sm text-negative"
        >
          {errors.root.message}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        isLoading={pending}
        className="h-14 w-full border border-brand/50 bg-linear-to-b from-teal-400 to-teal-600 text-white"
      >
        <span className="text-lg font-semibold">
          {complete ? "Signed in. Redirecting…" : isSubmitting ? "Signing in…" : "Sign In"}
        </span>
        {!pending ? <span aria-hidden="true">→</span> : null}
      </Button>
      <div className="flex items-center gap-5 text-sm text-foreground-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border-subtle" />
        or
        <span className="h-px flex-1 bg-border-subtle" />
      </div>
      <p className="text-center text-sm text-foreground-secondary">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Create account
        </Link>
      </p>
    </form>
  );
}
