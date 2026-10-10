import { z } from "zod";

export function isPublicSentryDsn(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /^[a-f0-9]{32}$/i.test(url.username) &&
      !url.password &&
      /^\/\d+$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

// Only a public ingestion key belongs in the browser; never a Sentry auth token.
export const publicSentryDsnSchema = z
  .string()
  .refine(isPublicSentryDsn, "Expected an HTTPS public Sentry DSN")
  .optional();

export const reportingReleaseSchema = z
  .string()
  .regex(/^[a-zA-Z0-9._-]{1,80}$/, "Expected a short build identifier")
  .optional();
