// Stores collected images in Supabase (free tier): the file goes to a private Storage
// bucket and a row (id, image_path, defect) goes to the `inspections` table.
// Server-side only: uses the service key. Setup SQL is in scripts/supabase.sql.

export const isStorageConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

const EXTENSIONS: Record<string, string> = { jpeg: "jpg", jpg: "jpg", png: "png", webp: "webp", gif: "gif" };

async function supabase(path: string, init: RequestInit): Promise<Response> {
  const key = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Supabase ${path.split("/")[1]} request failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function storeImage(id: string, imageDataUrl: string, defect: string): Promise<{ image_path: string; bytes: number }> {
  const match = /^data:image\/([a-z]+);base64,(.*)$/is.exec(imageDataUrl);
  if (!match) throw new Error("Image is not a base64 data URL.");
  const bytes = Buffer.from(match[2], "base64");
  const imagePath = `${id}.${EXTENSIONS[match[1].toLowerCase()] ?? "bin"}`;
  const bucket = process.env.SUPABASE_BUCKET || "inspection-images";

  await supabase(`/storage/v1/object/${bucket}/${imagePath}`, {
    method: "POST",
    headers: { "Content-Type": `image/${match[1].toLowerCase()}` },
    body: new Uint8Array(bytes),
  });
  await supabase("/rest/v1/inspections", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ id, image_path: imagePath, defect }),
  });
  return { image_path: imagePath, bytes: bytes.length };
}
