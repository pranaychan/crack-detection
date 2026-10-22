import OpenAI from "openai";

let client: OpenAI | undefined;

export function getNvidiaTimeoutMs(): number {
  return Number(process.env.NVIDIA_TIMEOUT_MS || 40000);
}

/** One chat call to the NVIDIA OpenAI-compatible endpoint. Returns the text content. */
export async function chat(system: string, text: string, imageDataUrl: string, maxTokens: number, timeoutMs: number): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured on the server.");
  const baseURL = process.env.NVIDIA_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_MODEL?.trim() || "deepseek-ai/deepseek-v4.1-flash";
  client ??= new OpenAI({
    apiKey,
    baseURL,
    maxRetries: 0, // fail fast so the trace shows which stage timed out
  });

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ] },
    ],
  }, { timeout: timeoutMs }).catch((e) => {
    if (e instanceof OpenAI.APIConnectionTimeoutError) {
      throw new Error(`NVIDIA request timed out after ${Math.round(timeoutMs / 1000)}s (model "${model}"). The model may be slow or overloaded; retry, or set NVIDIA_MODEL to a faster one.`);
    }
    // Say which model/host was called so auth and model-access problems are obvious.
    if (e instanceof OpenAI.APIError && e.status) {
      const hint = e.status === 401 || e.status === 403 ? " The API key is invalid, expired, or not allowed to use this model." : e.status === 404 ? " The model name may be wrong." : "";
      throw new Error(`NVIDIA API returned HTTP ${e.status} for model "${model}" at ${new URL(baseURL).host}.${hint} (${e.message})`);
    }
    throw e;
  });
  const choice = response.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`NVIDIA returned no text (finish_reason=${choice?.finish_reason ?? "unknown"}). Check the model supports image input.`);
  }
  return content.trim();
}
