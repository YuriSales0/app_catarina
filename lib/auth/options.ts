import "server-only";
import { getEnv } from "@/lib/env";

/** Which sign-in methods the login page should render. */
export function getSignInOptions() {
  const env = getEnv();
  return {
    google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
    devLogin: env.AUTH_DEV_LOGIN && env.NODE_ENV !== "production",
  };
}
