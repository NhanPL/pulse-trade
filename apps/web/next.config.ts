import type { NextConfig } from "next";

import "./src/lib/env/server";

const nextConfig: NextConfig = {
  agentRules: false,
};

export default nextConfig;
