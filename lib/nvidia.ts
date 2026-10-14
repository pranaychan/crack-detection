import OpenAI from "openai";

let client: OpenAI | undefined;

export function getNvidiaClient(): OpenAI {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured on the server.");
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
      // Prevent SDK retries from consuming the entire serverless execution window.
      // A clear timeout lets the route report which stage failed.
      timeout: Number(process.env.NVIDIA_TIMEOUT_MS || 40000),
      maxRetries: 0,
    });
  }
  return client;
}

export function getModelName(): string {
  return process.env.NVIDIA_MODEL || "deepseek-ai/deepseek-v4.1-flash";
}
