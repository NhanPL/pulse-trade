import type { NextConfig } from "next";

import "./src/lib/env/server";
import { validateHostedWebEnvironment } from "./src/lib/env/hosted-web-environment";

// NEXT_PUBLIC values are baked into the browser bundle; reject local defaults before deployment.
if (process.env.VERCEL === "1") {
  validateHostedWebEnvironment({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  });
}

const nextConfig: NextConfig = {
  agentRules: false,
};

export default nextConfig;
