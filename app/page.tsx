"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import type { AnalysisResponse } from "@/lib/types";

export default function Home() {
  const [description, setDescription] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  async function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > 2.8 * 1024 * 1024) { setError("Image must be 3 MB or smaller."); return; }
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
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, imageDataUrl }),
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
        <span className="top-tag">AI · KNOWLEDGE GRAPH</span>
      </header>

      <section className="hero">
        <p className="eyebrow">CONSTRUCTION DEFECT INTELLIGENCE</p>
        <h1>Understand the crack.<br /><span>Trace the evidence.</span></h1>
        <p className="hero-copy">Describe a crack or add a photo. NVIDIA AI extracts observations, then Neo4j retrieves related cases from your defect knowledge graph.</p>
      </section>

      <section className="workspace">
        <form className="input-panel panel" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">01 / OBSERVATION</p><h2>Describe the defect</h2></div><span className="step">INPUT</span></div>
          <label htmlFor="description">What do you observe?</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Example: A diagonal crack starts at the corner of a window in a masonry wall. The crack appears to be widening..." rows={6} />
          <div className="upload-row">
            <label className="upload-button" htmlFor="image">＋ Attach image</label>
            <input id="image" type="file" accept="image/*" onChange={onImageChange} />
            <span className="upload-note">Optional · max 2.8 MB</span>
          </div>
          {imageName && <div className="file-chip">{imageName}<button type="button" aria-label="Remove image" onClick={() => { setImageDataUrl(undefined); setImageName(""); }}>×</button></div>}
          <button className="primary-button" type="submit" disabled={loading || (!description.trim() && !imageDataUrl)}>{loading ? <><span className="spinner" /> Analysing observation…</> : <>Analyse defect <span>↗</span></>}</button>
          <p className="privacy-note">Your API credentials stay on the server. Images are sent to the configured NVIDIA endpoint for analysis.</p>
          {error && <p className="error-message" role="alert">{error}</p>}
        </form>

        <aside className="side-panel">
          <div className="panel panel-info"><p className="eyebrow">HOW IT WORKS</p><ol className="steps"><li><span>1</span><div><strong>Extract</strong><p>Identify crack type, component and visible symptoms.</p></div></li><li><span>2</span><div><strong>Retrieve</strong><p>Search connected cases and potential causes in Neo4j.</p></div></li><li><span>3</span><div><strong>Review</strong><p>Summarise relevant records and evidence limitations.</p></div></li></ol></div>
          <div className="disclaimer"><span className="warning-icon">!</span><p><strong>Decision support only</strong><br />A photo or a similar case cannot confirm root cause or certify structural safety.</p></div>
        </aside>
      </section>

      {result && <section className="results" aria-live="polite">
        <div className="results-heading"><div><p className="eyebrow">02 / FINDINGS</p><h2>Analysis results</h2></div><span className={`connection ${result.graph_connected ? "connected" : "disconnected"}`}><span />{result.graph_connected ? "Knowledge graph queried" : "Graph not connected"}</span></div>
        <div className="result-grid">
          <article className="panel extracted-panel"><p className="eyebrow">EXTRACTED OBSERVATION</p><dl className="field-list">
            <div><dt>Crack type</dt><dd>{result.extracted.crack_type || "Not identified"}</dd></div>
            <div><dt>Component</dt><dd>{result.extracted.component || "Not identified"}</dd></div>
            <div><dt>Building type</dt><dd>{result.extracted.building_type || "Not identified"}</dd></div>
            <div><dt>Symptoms</dt><dd>{result.extracted.symptoms || "Not provided"}</dd></div>
            <div><dt>Uncertainty</dt><dd>{result.extracted.uncertainty || "Not specified"}</dd></div>
          </dl></article>
          <article className="panel analysis-panel"><p className="eyebrow">AI SUMMARY</p><div className="analysis-text">{result.analysis}</div></article>
        </div>
        <div className="cases-heading"><h3>Related knowledge-graph cases</h3><span>{result.related_cases.length} found</span></div>
        {result.related_cases.length ? <div className="case-list">{result.related_cases.map((c) => <article className="case-card" key={c.case_id}>
          <div className="case-top"><strong>{c.case_id}</strong><span className={`priority priority-${(c.priority || "unknown").toLowerCase()}`}>{c.priority || "Unrated"}</span></div>
          <h4>{c.crack_type || "Crack case"} <span>·</span> {c.component || "Component not specified"}</h4>
          <p>{c.symptoms || "No symptoms recorded."}</p>
          {c.potential_causes.length > 0 && <div className="cause-tags">{c.potential_causes.map((cause) => <span key={cause}>{cause}</span>)}</div>}
          {c.evidence_notes && <p className="case-meta"><strong>Evidence notes:</strong> {c.evidence_notes}</p>}
          {c.follow_up && <p className="case-meta"><strong>Suggested follow-up:</strong> {c.follow_up}</p>}
        </article>)}</div> : <div className="empty-state">No related cases were returned. Confirm the graph is populated with `DefectCase`, `CrackType`, `Component` and `PotentialCause` nodes, and that relationship names match the import schema.</div>}
        <div className="limitations"><strong>Limitations</strong><ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </section>}

      <footer><span>CrackScope</span><span>Built with NVIDIA AI + Neo4j</span><span>Not a substitute for professional engineering assessment.</span></footer>
    </main>
  );
}
