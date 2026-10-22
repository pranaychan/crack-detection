"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { Header } from "@/components/Header";
import { DEFAULT_TOP_K, DEFECTS, MAX_TOP_K } from "@/lib/defects";
import type { AnalysisError, AnalysisResponse, TraceStep } from "@/lib/types";

const MAX_BYTES = 2.8 * 1024 * 1024;

export default function Home() {
  const [image, setImage] = useState<string>();
  const [defect, setDefect] = useState("");
  const [k, setK] = useState(DEFAULT_TOP_K);
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
    if (!image || !defect) return;
    setLoading(true); setError(""); setResult(undefined); setTrace([]);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: image, defect, k }),
      });
      const text = await res.text();
      let data: AnalysisResponse | AnalysisError;
      try { data = JSON.parse(text); }
      catch { throw new Error(res.status === 504 ? "The server timed out before it could answer (hosting time limit). Please try again." : `Server returned HTTP ${res.status} with a non-JSON body: ${text.slice(0, 200)}`); }
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
    validate_input: "Validate input",
    store_image: "Store image (Supabase)",
    knowledge_graph: "Query knowledge graph",
    explain: "Predict (NVIDIA)",
  };

  return (
    <main className="shell">
      <Header active="analyse" />

      <form className="card" onSubmit={submit}>
        <label className={`drop ${image ? "filled" : ""}`}>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onImageChange} />
          {image
            ? <img src={image} alt="Selected upload" />
            : <span><strong>Choose an image</strong><small>JPEG, PNG, WebP or GIF · up to 2.8 MB</small></span>}
        </label>
        <div className="fields">
          <label>
            <span className="label">Defect type</span>
            <select value={defect} onChange={(e) => setDefect(e.target.value)} required>
              <option value="" disabled>Select a defect…</option>
              {DEFECTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Causes to use (top k)</span>
            <input type="number" min={1} max={MAX_TOP_K} step={1} value={k}
              onChange={(e) => setK(Math.min(MAX_TOP_K, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
          </label>
        </div>
        <label>
          <span className="label">Metadata <small>(coming soon)</small></span>
          <textarea rows={2} disabled placeholder="Building age, location, observations… not used yet." />
        </label>
        <button type="submit" disabled={!image || !defect || loading}>
          {loading && <i className="spinner" />}{loading ? "Analysing…" : "Analyse"}
        </button>
        <small className="muted">Uploaded images are saved, with the selected defect, to build a dataset.</small>
      </form>

      {error && <p className="card error" role="alert">{error}</p>}

      {result && (
        <section className="card result">
          <span className="label">Defect type</span>
          <h2><span className="badge">{result.defect}</span></h2>
          {result.causes.length === 0 && (
            <p className="warn">No knowledge-graph causes were available for this defect, so this prediction relies on the image alone. See the pipeline trace.</p>
          )}
          {result.causes.length > 0 && <>
            <span className="label">Knowledge-graph causes used ({result.causes.length})</span>
            <ul className="causes">{result.causes.map((c) => <li key={c.cause_id}>{c.cause_id}</li>)}</ul>
          </>}
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
