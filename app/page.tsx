"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import type { AnalysisResponse } from "@/lib/types";

export default function Home() {
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState("");
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis request failed.");
      setResult(data as AnalysisResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">C</span><span>CrackScope</span></a>
        <span className="top-tag">IMAGE · AI · KNOWLEDGE GRAPH</span>
      </header>

      <section className="hero">
        <p className="eyebrow">CONSTRUCTION DEFECT INTELLIGENCE</p>
        <h1>Upload the crack.<br /><span>Trace potential causes.</span></h1>
        <p className="hero-copy">Upload a photo. NVIDIA DeepSeek identifies the closest crack type and component from the available categories, then Neo4j Aura retrieves the associated potential causes.</p>
      </section>

      <section className="workspace image-workspace">
        <form className="input-panel panel" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">01 / IMAGE INPUT</p><h2>Upload crack image</h2></div><span className="step">REQUIRED</span></div>
          <p className="input-description">Use a clear, well-lit image where the crack and the affected building element are visible.</p>
          <div className={`image-dropzone ${imageDataUrl ? "has-image" : ""}`}>
            {imageDataUrl ? <img className="image-preview" src={imageDataUrl} alt="Selected crack for analysis" /> : <div className="image-placeholder"><span className="image-placeholder-icon">＋</span><strong>Select an image</strong><span>JPEG, PNG, WebP or GIF · max 2.8 MB</span></div>}
            <label className="upload-button" htmlFor="image">{imageDataUrl ? "Choose another image" : "Browse files"}</label>
            <input id="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onImageChange} />
          </div>
          {imageName && <div className="file-chip">{imageName}<button type="button" aria-label="Remove image" onClick={() => { setImageDataUrl(undefined); setImageName(""); setResult(null); }}>×</button></div>}
          <button className="primary-button" type="submit" disabled={loading || !imageDataUrl}>{loading ? <><span className="spinner" /> Analysing image…</> : <>Identify crack & retrieve causes <span>↗</span></>}</button>
          <p className="privacy-note">The image is sent to the configured NVIDIA API. Credentials remain server-side.</p>
          {error && <p className="error-message" role="alert">{error}</p>}
        </form>

        <aside className="side-panel result-side-panel" aria-live="polite">
          {!result && !loading && <div className="panel panel-info side-result-placeholder"><p className="eyebrow">02 / KNOWLEDGE GRAPH RESULTS</p><h2>Potential causes appear here</h2><p className="placeholder-copy">After image analysis, the presumed crack type and component will be matched against Neo4j Aura. Any linked potential causes will appear in this panel.</p><div className="mini-flow"><span>Image</span><b>→</b><span>DeepSeek</span><b>→</b><span>Neo4j</span></div></div>}
          {loading && <div className="panel panel-info side-result-placeholder"><span className="spinner" /><h2>Analysing image</h2><p className="placeholder-copy">Identifying the crack and component, then querying the knowledge graph…</p></div>}
          {result && <div className="panel panel-info cause-result-panel">
            <p className="eyebrow">02 / KNOWLEDGE GRAPH RESULTS</p>
            <h2>Potential causes</h2>
            <div className="connection"><span />{result.graph_connected ? "Neo4j Aura queried" : "Graph unavailable"}</div>
            <div className="classification-block"><span className="result-label">PRESUMED CRACK TYPE</span><strong>{result.extracted.crack_type || "Not identified"}</strong><span className="result-label">PRESUMED COMPONENT</span><strong>{result.extracted.component || "Not identified"}</strong></div>
            <div className="visual-observation"><span className="result-label">VISIBLE OBSERVATION</span><p>{result.extracted.visual_observation}</p><p className="uncertainty-note">{result.extracted.confidence_note}</p></div>
            {result.potential_causes.length > 0 ? <ul className="potential-cause-list">{result.potential_causes.map((cause, index) => <li key={`${cause}-${index}`}>{cause}</li>)}</ul> : <div className="empty-state compact-empty">{result.message || "No potential causes were returned."}</div>}
            {result.matched_cases.length > 0 && <div className="matched-cases"><h3>Matched cases ({result.matched_cases.length})</h3>{result.matched_cases.map((item) => <article className="matched-case" key={item.case_id}><strong>{item.case_id}</strong>{item.building_type && <span>{item.building_type}</span>}{item.observed_symptoms && <p>{item.observed_symptoms}</p>}{item.evidence_notes && <p className="case-meta"><strong>Evidence:</strong> {item.evidence_notes}</p>}</article>)}</div>}
            <div className="disclaimer"><span className="warning-icon">!</span><p><strong>Unverified associations</strong><br />These are potential causes stored in the knowledge graph, not confirmed diagnoses. A photograph cannot establish structural safety.</p></div>
            {result.limitations.length > 0 && <ul className="limitations-list">{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul>}
          </div>}
        </aside>
      </section>

      <footer><span>CrackScope</span><span>DeepSeek NVIDIA API + Neo4j Aura</span><span>Decision support only · Not a structural safety assessment</span></footer>
    </main>
  );
}
