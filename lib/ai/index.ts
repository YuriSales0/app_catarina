import { getEnv } from "@/lib/env";
import { NullAIProvider, type AIProvider, type AiQuality } from "./provider";

const instances = new Map<AiQuality, AIProvider>();

/**
 * Resolves the configured provider, one instance per conversation quality.
 * Null unless AI_PROVIDER says otherwise.
 */
export async function getAIProvider(options: { quality?: AiQuality } = {}): Promise<AIProvider> {
  const quality = options.quality ?? "standard";
  const cached = instances.get(quality);
  if (cached) return cached;
  const env = getEnv();
  let provider: AIProvider;
  if (env.AI_PROVIDER === "openai") {
    const { OpenAIProvider } = await import("./openai-provider");
    provider = new OpenAIProvider({ apiKey: env.OPENAI_API_KEY!, baseUrl: env.OPENAI_BASE_URL, models: { standard: env.OPENAI_MODEL, high: env.OPENAI_MODEL_HIGH }, quality });
  } else {
    provider = new NullAIProvider();
  }
  instances.set(quality, provider);
  return provider;
}

export function resetAIProvider() {
  instances.clear();
}
