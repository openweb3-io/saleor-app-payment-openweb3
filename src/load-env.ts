import nextEnv from "@next/env";

if (process.env.NODE_ENV === "development") {
  nextEnv.loadEnvConfig(".");
} else {
  nextEnv.loadEnvConfig(process.cwd());
}
