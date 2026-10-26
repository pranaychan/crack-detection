import { Header } from "@/components/Header";
import { DEFAULT_TOP_K, DEFECTS, MAX_TOP_K } from "@/lib/defects";
import { findModel, type ModelId } from "@/lib/models";

// Static placeholder for models that are not implemented yet: same layout as the live pages, nothing is wired up.
export function StaticModelPage({ model, view }: { model: ModelId; view: "analyse" | "graph" }) {
  const label = findModel(model)!.label;
  return (
    <main className={`shell${view === "graph" ? " wide" : ""}`} data-model={model}>
      <Header model={model} view={view} />
      <p className="card warn-soft" role="status"><strong>{label} is a placeholder.</strong> This {view === "graph" ? "graph editor" : "model"} is not connected yet, so nothing on this page works.</p>

      {view === "analyse" ? (
        <form className="card" aria-disabled="true">
          <label className="drop"><span><strong>Choose an image</strong><small>JPEG, PNG, WebP or GIF · up to 2.8 MB</small></span><input type="file" disabled /></label>
          <div className="fields">
            <label><span className="label">Defect type</span>
              <select disabled defaultValue=""><option value="" disabled>Select a defect…</option>{DEFECTS.map((d) => <option key={d.id}>{d.label}</option>)}</select></label>
            <label><span className="label">Causes to use (top k)</span><input type="number" disabled min={1} max={MAX_TOP_K} defaultValue={DEFAULT_TOP_K} /></label>
          </div>
          <label><span className="label">Metadata <small>(coming soon)</small></span><textarea rows={2} disabled placeholder="Building age, location, observations…" /></label>
          <button type="submit" disabled>Analyse</button>
        </form>
      ) : (
        <>
          <div className="card toolbar"><select disabled><option>Defect</option></select><button disabled>Reload</button></div>
          <div className="editor">
            <div className="card list"><p className="muted empty">No nodes: this model has no graph yet.</p></div>
            <div className="card detail"><p className="muted empty">Select a node to view or edit it. Not available yet.</p></div>
          </div>
        </>
      )}
    </main>
  );
}
