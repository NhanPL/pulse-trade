import { z } from "zod";

import { environmentSchema, type EnvironmentVariables } from "./env.schema";

export type Environment = Readonly<{
  nodeEnv: EnvironmentVariables["NODE_ENV"];
  port: EnvironmentVariables["PORT"];
}>;

export function loadEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const issues = z.prettifyError(result.error);

    throw new Error(`Invalid API environment configuration:\n${issues}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
  };
}
