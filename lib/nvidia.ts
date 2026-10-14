import OpenAI from "openai";

let client: OpenAI | undefined;

export function getNvidiaTimeoutMs(): number {
  return Number(process.env.NVIDIA_TIMEOUT_MS || 40000);
}

/** One chat call to the NVIDIA OpenAI-compatible endpoint. Returns the text content. */
export async function chat(system: string, text: string, imageDataUrl: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured on the server.");
  client ??= new OpenAI({
    apiKey,
    baseURL: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    timeout: getNvidiaTimeoutMs(),
    maxRetries: 0, // fail fast so the trace shows which stage timed out
  });

  const response = await client.chat.completions.create({
    model: process.env.NVIDIA_MODEL || "deepseek-ai/deepseek-v4.1-flash",
    temperature: 0.1,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ] },
    ],
  });
  const choice = response.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`NVIDIA returned no text (finish_reason=${choice?.finish_reason ?? "unknown"}). Check the model supports image input.`);
  }
  return content.trim();
}
