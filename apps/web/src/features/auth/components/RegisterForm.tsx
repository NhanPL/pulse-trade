"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { registerUser } from "../api/register";
import { registerFormSchema, type RegisterFormValues } from "../schemas/register-form";
import { AuthIcon } from "./AuthIcon";

const linkClass =
  "rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function RegisterForm() {
  const [complete, setComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (complete) successHeading.current?.focus();
  }, [complete]);

  const submit = async (values: RegisterFormValues) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    clearErrors("root");
    try {
      await registerUser({ email: values.email, password: values.password }, controller.signal);
      if (!controller.signal.aborted) {
        reset();
        setComplete(true);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError("root", {
          message:
            error instanceof Error ? error.message : "Registration failed. Please try again.",
        });
    } finally {
      request.current = null;
    }
  };

  if (complete)
    return (
      <div className="space-y-5 py-5 text-center" role="status">
        <h2 ref={successHeading} tabIndex={-1} className="text-2xl font-semibold outline-none">
          Your account is ready
        </h2>
        <p className="text-foreground-secondary">
          You received <strong className="text-positive">$10,000 virtual USD</strong>. Sign in to
          start paper trading.
        </p>
        <Link href="/login?registered=1" className={`${linkClass} inline-block font-semibold`}>
          Continue to sign in →
        </Link>
        <p className="text-sm">
          <Link href="/" className={linkClass}>
            Explore markets
          </Link>
        </p>
      </div>
    );

  const visibilityButton = (label: string, shown: boolean, toggle: () => void) => (
    <button
      type="button"
      aria-label={`${shown ? "Hide" : "Show"} ${label}`}
      aria-pressed={shown}
      onClick={toggle}
      className="grid size-8 place-items-center rounded hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <AuthIcon name="eye" />
    </button>
  );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // Lock before async validation so repeated Enter presses cannot restart submission state.
        if (submitting.current) return;
        submitting.current = true;
        void handleSubmit(submit)(event).finally(() => {
          submitting.current = false;
        });
      }}
      className="space-y-5"
      aria-busy={isSubmitting}
    >
      <Input
        {...register("email")}
        label="Email"
        aria-required="true"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        leadingIcon={<AuthIcon name="email" />}
        readOnly={isSubmitting}
        error={errors.email ? "Enter a valid email address." : undefined}
        className="h-12 bg-canvas/40"
      />
      <Input
        {...register("password")}
        label="Password"
        aria-required="true"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        placeholder="At least 8 characters"
        description="Use 8–128 characters."
        leadingIcon={<AuthIcon name="lock" />}
        readOnly={isSubmitting}
        error={errors.password ? "Use a password between 8 and 128 characters." : undefined}
        trailingElement={visibilityButton("password", showPassword, () =>
          setShowPassword(!showPassword),
        )}
        className="h-12 bg-canvas/40"
      />
      <Input
        {...register("confirmPassword")}
        label="Confirm password"
        aria-required="true"
        type={showConfirmation ? "text" : "password"}
        autoComplete="new-password"
        placeholder="Re-enter your password"
        leadingIcon={<AuthIcon name="lock" />}
        readOnly={isSubmitting}
        error={errors.confirmPassword?.message}
        trailingElement={visibilityButton("confirm password", showConfirmation, () =>
          setShowConfirmation(!showConfirmation),
        )}
        className="h-12 bg-canvas/40"
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
        isLoading={isSubmitting}
        className="w-full border border-brand/50 bg-linear-to-b from-teal-400 to-teal-600 text-white"
      >
        {isSubmitting ? "Creating account…" : "Create Account"}
      </Button>
      <p className="text-center text-sm text-foreground-secondary">
        Already have an account?{" "}
        <Link href="/login" className={linkClass}>
          Sign In
        </Link>
      </p>
    </form>
  );
}
