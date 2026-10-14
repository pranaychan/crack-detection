"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import type { AnalysisResponse, MatchingCase } from "@/lib/types";

type TabId = "image" | "ai" | "request" | "response";
const TABS: { id: TabId; number: string; title: string; subtitle: string }[] = [
  { id: "image", number: "01", title: "Image input", subtitle: "Upload" },
  { id: "ai", number: "02", title: "AI prediction", subtitle: "DeepSeek" },
  { id: "request", number: "03", title: "Data sent to Neo4j", subtitle: "Query input" },
  { id: "response", number: "04", title: "Output from Neo4j", subtitle: "Query results" },
];

function CodeBlock({ value }: { value: unknown }) {
  return <pre className="data-code"><code>{JSON.stringify(value, null, 2)}</code></pre>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("image");
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState("");
  const [imageSize, setImageSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  async function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setResult(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > 2.8 * 1024 * 1024) { setError("Image must be 2.8 MB or smaller."); return; }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image."));
        reader.onerror = () => reject(new Error("Could not read image."));
        reader.readAsDataURL(file);
      });
      setImageDataUrl(dataUrl);
      setImageName(file.name);
      setImageSize(file.size);
      setActiveTab("image");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read image."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!imageDataUrl) { setError("Upload a crack image first."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const responseText = await response.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(responseText) as Record<string, unknown>; }
      catch {
        const preview = responseText.trim().slice(0, 220);
        throw new Error(response.status === 504
          ? "The analysis timed out on the server (HTTP 504). The image/model request took longer than the deployment allows. Try again with a smaller image, or inspect Vercel Runtime Logs."
          : response.status === 413
            ? "The image request is too large. Choose a smaller image and try again."
            : `Server returned a non-JSON error (HTTP ${response.status}). ${preview || "No error details were returned."}`);
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Analysis request failed.");
      setResult(data as unknown as AnalysisResponse);
      setActiveTab("ai");
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setLoading(false); }
  }

  const pipeline = result?.pipeline;
  const graphParams = pipeline?.neo4j_parameters ?? null;
  const graphOutput = pipeline?.neo4j_output ?? result?.matched_cases ?? [];

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">C</span><span>CrackScope</span></a>
        <span className="top-tag">IMAGE <i>→</i> AI <i>→</i> KNOWLEDGE GRAPH</span>
      </header>
      <section className="hero">
        <p className="eyebrow">CONSTRUCTION DEFECT INTELLIGENCE</p>
        <h1>Trace the crack.<br /><span>Inspect every step.</span></h1>
        <p className="hero-copy">Follow the complete pipeline from the uploaded image to DeepSeek's prediction, the parameters sent to Neo4j Aura, and the graph records returned.</p>
      </section>

      <section className="pipeline-panel">
        <nav className="pipeline-tabs" aria-label="Analysis pipeline tabs" role="tablist">
          {TABS.map((tab) => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} className={`pipeline-tab ${activeTab === tab.id ? "active" : ""} ${result && tab.id !== "image" ? "has-result" : ""}`} onClick={() => setActiveTab(tab.id)}>
            <span className="tab-number">{tab.number}</span><span className="tab-copy"><strong>{tab.title}</strong><small>{tab.subtitle}</small></span><span className="tab-arrow">↗</span>
          </button>)}
        </nav>

        <div className="tab-content" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "image" && <form className="image-tab" onSubmit={submit}>
            <div className="section-heading"><div><p className="eyebrow">STEP 01 / INPUT</p><h2>Upload crack image</h2></div><span className="status-chip">IMAGE REQUIRED</span></div>
            <p className="section-copy">Choose a clear, well-lit photo where the crack and the affected building element are visible. The image is sent to NVIDIA for visual classification.</p>
            <div className={`image-dropzone ${imageDataUrl ? "has-image" : ""}`}>
              {imageDataUrl ? <img className="image-preview" src={imageDataUrl} alt="Selected crack for analysis" /> : <div className="image-placeholder"><span className="image-placeholder-icon">＋</span><strong>Select an image</strong><span>JPEG, PNG, WebP or GIF · max 2.8 MB</span></div>}
              <label className="upload-button" htmlFor="image">{imageDataUrl ? "Choose another image" : "Browse files"}</label>
              <input id="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onImageChange} />
            </div>
            {imageName && <div className="file-chip"><span>{imageName} · {(imageSize / 1024).toFixed(0)} KB</span><button type="button" aria-label="Remove image" onClick={() => { setImageDataUrl(undefined); setImageName(""); setImageSize(0); setResult(null); }}>×</button></div>}
            <button className="primary-button" type="submit" disabled={loading || !imageDataUrl}>{loading ? <><span className="spinner" /> Analysing image…</> : <>Run analysis pipeline <span>↗</span></>}</button>
            <p className="privacy-note">API credentials remain on the server and are never sent to the browser.</p>
            {error && <p className="error-message" role="alert">{error}</p>}
          </form>}

          {activeTab === "ai" && <section className="detail-tab">
            <div className="section-heading"><div><p className="eyebrow">STEP 02 / NVIDIA DEEPSEEK</p><h2>AI prediction</h2></div><span className={`status-chip ${result ? "status-success" : ""}`}>{result ? "RESPONSE RECEIVED" : "AWAITING ANALYSIS"}</span></div>
            {!result ? <div className="empty-state"><strong>No AI prediction yet</strong><p>Upload an image in the first tab and run the analysis. The detected labels will appear here exactly as returned by the model, even if they are not present in your graph vocabulary.</p><button className="secondary-button" onClick={() => setActiveTab("image")}>Go to image input ↗</button></div> : <>
              <div className="prediction-grid"><article className="prediction-card"><span className="result-label">PRESUMED CRACK TYPE</span><strong>{result.extracted.crack_type || "Not identified"}</strong><small>Model-detected label · not forced to graph vocabulary</small></article><article className="prediction-card"><span className="result-label">PRESUMED COMPONENT</span><strong>{result.extracted.component || "Not identified"}</strong><small>Model-detected label · not forced to graph vocabulary</small></article></div>
              <article className="observation-card"><span className="result-label">VISUAL OBSERVATION</span><p>{result.extracted.visual_observation}</p><span className="result-label">MODEL UNCERTAINTY</span><p>{result.extracted.confidence_note}</p></article>
              <h3 className="subheading">Structured AI output</h3><CodeBlock value={pipeline?.ai_output ?? result.extracted} />
              <div className="action-row"><button className="secondary-button" onClick={() => setActiveTab("request")}>Inspect data sent to Neo4j ↗</button></div>
            </>}
          </section>}

          {activeTab === "request" && <section className="detail-tab">
            <div className="section-heading"><div><p className="eyebrow">STEP 03 / GRAPH QUERY INPUT</p><h2>Data sent to Neo4j</h2></div><span className={`status-chip ${pipeline?.neo4j_lookup_performed ? "status-success" : ""}`}>{pipeline?.neo4j_lookup_performed ? "QUERY EXECUTED" : "NOT EXECUTED"}</span></div>
            {!result ? <div className="empty-state"><strong>Waiting for AI prediction</strong><p>After you run the analysis, this tab will show the exact parameters and Cypher query used for the Aura lookup.</p><button className="secondary-button" onClick={() => setActiveTab("image")}>Go to image input ↗</button></div> : <>
              <p className="section-copy">Only graph-mapped labels are passed to the exact-match query. If the model returns a new label, its prediction remains visible but the lookup is skipped rather than silently substituting another label.</p>
              <h3 className="subheading">Query parameters</h3><CodeBlock value={graphParams ?? { note: "No parameters sent: one or both AI labels did not exactly match the graph vocabulary, or Aura is not configured/connected." }} />
              <h3 className="subheading">Cypher query</h3><CodeBlock value={pipeline?.neo4j_query ?? "Query details are not available in this response."} />
              <div className="action-row"><button className="secondary-button" onClick={() => setActiveTab("response")}>Inspect Neo4j output ↗</button></div>
            </>}
          </section>}

          {activeTab === "response" && <section className="detail-tab">
            <div className="section-heading"><div><p className="eyebrow">STEP 04 / AURA RESPONSE</p><h2>Output from Neo4j</h2></div><span className={`status-chip ${result?.graph_connected ? "status-success" : ""}`}>{result ? (result.graph_connected ? "CONNECTED" : "UNAVAILABLE") : "AWAITING QUERY"}</span></div>
            {!result ? <div className="empty-state"><strong>No Neo4j response yet</strong><p>Run an image analysis to inspect the records returned by Aura.</p><button className="secondary-button" onClick={() => setActiveTab("image")}>Go to image input ↗</button></div> : <>
              <div className="result-summary"><div><strong>{graphOutput.length}</strong><span>matching case records</span></div><div><strong>{result.potential_causes.length}</strong><span>unique potential causes</span></div></div>
              {result.message && <div className="notice-block">{result.message}</div>}
              {result.potential_causes.length > 0 && <><h3 className="subheading">Potential causes from graph</h3><ul className="potential-cause-list">{result.potential_causes.map((cause, i) => <li key={`${cause}-${i}`}>{cause}</li>)}</ul></>}
              {result.diagnostics && <><h3 className="subheading">Request diagnostics</h3><div className="result-summary"><div><strong>{(result.diagnostics.total_ms / 1000).toFixed(2)}s</strong><span>Total server processing time</span></div><div><strong>{result.request_id || "—"}</strong><span>Request ID for Vercel logs</span></div></div><CodeBlock value={{ ...result.diagnostics, timings_ms: result.diagnostics.timings_ms }} /></>}
              <h3 className="subheading">Raw Neo4j result rows</h3>
              {graphOutput.length ? <CodeBlock value={graphOutput as MatchingCase[]} /> : <div className="empty-state"><strong>No matching rows returned</strong><p>The query may have matched no cases, or it may not have executed because the AI labels were not in the graph vocabulary.</p></div>}
              {result.limitations.length > 0 && <div className="notice-block warning-block"><strong>Interpretation note</strong><ul>{result.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
            </>}
          </section>}
        </div>
        <div className="panel-footer"><span>CrackScope pipeline inspector</span><span>{result ? "Analysis response available" : "Run analysis to populate all four tabs"}</span></div>
      </section>
      <footer><span>CrackScope</span><span>DeepSeek NVIDIA API + Neo4j Aura</span><span>Decision support only · Not a structural safety assessment</span></footer>
    </main>
  );
}
