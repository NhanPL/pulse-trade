import { z } from "zod";

function hostedEndpointSchema(protocol: "https:" | "wss:", pathname: string) {
  return z.url().refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isLocal =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.") ||
      hostname === "[::1]" ||
      hostname === "[::]";

    return (
      url.protocol === protocol &&
      !isLocal &&
      url.pathname === pathname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, `Expected a non-local ${protocol}// endpoint ending in ${pathname}, without credentials, query, fragment or trailing slash`);
}

const hostedWebEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: hostedEndpointSchema("https:", "/api/v1"),
  NEXT_PUBLIC_WS_URL: hostedEndpointSchema("wss:", "/realtime"),
});

export function validateHostedWebEnvironment(input: {
  NEXT_PUBLIC_API_URL: string | undefined;
  NEXT_PUBLIC_WS_URL: string | undefined;
}): void {
  const result = hostedWebEnvironmentSchema.safeParse(input);
  if (!result.success) {
    // Report field names and rules, not configuration values that may contain credentials.
    throw new Error(
      `Invalid hosted web environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
}
