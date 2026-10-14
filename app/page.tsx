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

  const STAGE_LABELS: Record<TraceStep["stage"], string> = {
    validate_image: "Validate image",
    classify_defect: "Classify defect (NVIDIA)",
    knowledge_graph: "Query knowledge graph",
    explain: "Explain (NVIDIA)",
  };

  return (
    <main className="shell">
      <header>
        <span className="logo">C</span>
        <div>
          <h1>CrackScope</h1>
          <p className="muted">Image → defect → knowledge graph → likely cause</p>
        </div>
      </header>

      <form className="card" onSubmit={submit}>
        <label className={`drop ${image ? "filled" : ""}`}>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onImageChange} />
          {image
            ? <img src={image} alt="Selected upload" />
            : <span><strong>Choose an image</strong><small>JPEG, PNG, WebP or GIF · up to 2.8 MB</small></span>}
        </label>
        <button type="submit" disabled={!image || loading}>
          {loading && <i className="spinner" />}{loading ? "Analysing…" : "Analyse image"}
        </button>
      </form>

      {error && <p className="card error" role="alert">{error}</p>}

      {result && (
        <section className="card result">
          <span className="label">Detected defect</span>
          <h2><span className={`badge ${result.defect === "No defect" ? "none" : ""}`}>{result.defect}</span></h2>
          <span className="label">What could have happened</span>
          <p>{result.explanation}</p>
          <small className="muted">Unverified decision support, not a structural safety assessment.</small>
        </section>
      )}

      {trace.length > 0 && (
        <details className="card trace">
          <summary>Pipeline trace <small className="muted">· request {requestId}</small></summary>
          <ol>
            {trace.map((s) => (
              <li key={s.stage} className={s.status}>
                <div className="step-head">
                  <strong>{STAGE_LABELS[s.stage]}</strong>
                  <span className="pill">{s.status} · {s.ms} ms</span>
                </div>
                <pre>{JSON.stringify(s.detail, null, 2)}</pre>
              </li>
            ))}
          </ol>
        </details>
      )}
    </main>
  );
}
