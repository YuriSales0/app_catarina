import { getEnv } from "@/lib/env";
import { NullAIProvider, type AIProvider } from "./provider";

let instance: AIProvider | null = null;

/** Resolves the configured provider once. Null unless AI_PROVIDER says otherwise. */
export async function getAIProvider(): Promise<AIProvider> {
  if (instance) return instance;
  const env = getEnv();
  if (env.AI_PROVIDER === "openai") {
    const { OpenAIProvider } = await import("./openai-provider");
    instance = new OpenAIProvider({ apiKey: env.OPENAI_API_KEY!, baseUrl: env.OPENAI_BASE_URL, model: env.OPENAI_MODEL });
  } else {
    instance = new NullAIProvider();
  }
  return instance;
}

export function resetAIProvider() {
  instance = null;
}
