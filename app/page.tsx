"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import type { AnalysisError, AnalysisResponse, TraceStep } from "@/lib/types";

const MAX_BYTES = 2.8 * 1024 * 1024;

export default function Home() {
  const [image, setImage] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResponse>();
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [requestId, setRequestId] = useState("");

  function onImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(undefined); setTrace([]); setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");
    if (file.size > MAX_BYTES) return setError("Image must be 2.8 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.onerror = () => setError("Could not read the image.");
    reader.readAsDataURL(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!image) return;
    setLoading(true); setError(""); setResult(undefined); setTrace([]);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: image }),
      });
      const text = await res.text();
      let data: AnalysisResponse | AnalysisError;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned HTTP ${res.status} with a non-JSON body: ${text.slice(0, 200)}`); }
      setRequestId(data.request_id);
      setTrace(data.trace);
      if (!res.ok) {
        const err = data as AnalysisError;
        throw new Error(`${err.error} (stage: ${err.failed_stage})`);
      }
      setResult(data as AnalysisResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <h1>CrackScope</h1>
      <p className="muted">Upload an image of a defect. It is classified by NVIDIA, looked up in the knowledge graph, and explained.</p>

      <form onSubmit={submit}>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onImageChange} />
        {image && <img className="preview" src={image} alt="Selected upload" />}
        <button type="submit" disabled={!image || loading}>{loading ? "Analysing…" : "Analyse image"}</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {result && (
        <section className="result">
          <h2>{result.defect}</h2>
          <p>{result.explanation}</p>
          <p className="muted">Unverified decision support, not a structural safety assessment.</p>
        </section>
      )}

      {trace.length > 0 && (
        <details className="trace">
          <summary>Pipeline trace · request {requestId}</summary>
          {trace.map((s) => (
            <div key={s.stage} className={`step ${s.status}`}>
              <strong>{s.stage}</strong> <span>{s.status} · {s.ms} ms</span>
              <pre>{JSON.stringify(s.detail, null, 2)}</pre>
            </div>
          ))}
        </details>
      )}
    </main>
  );
}
