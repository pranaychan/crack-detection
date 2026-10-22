"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { ID_KEYS, LABELS, REL_TYPES, type GraphNode, type Label, type NodeRef, type Relationship, type RelType } from "@/lib/graph-schema";

type Row = { key: string; value: string; json: boolean };
type Selection = { mode: "none" } | { mode: "new" } | { mode: "edit"; id: string };

const toRows = (p: GraphNode["properties"]): Row[] =>
  Object.entries(p).map(([key, v]) => ({ key, value: typeof v === "string" ? v : JSON.stringify(v), json: typeof v !== "string" }));

// Non-string values (numbers, booleans, lists) keep their type by being parsed as JSON.
function fromRows(rows: Row[]) {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const key = r.key.trim();
    if (!key) continue;
    try { out[key] = r.json ? JSON.parse(r.value) : r.value; }
    catch { throw new Error(`"${key}" must be valid JSON (e.g. 3, true or ["a","b"]).`); }
  }
  return out;
}

export default function GraphEditor() {
  const [label, setLabel] = useState<Label>("Defect");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [filter, setFilter] = useState("");
  const [selection, setSelection] = useState<Selection>({ mode: "none" });
  const [rows, setRows] = useState<Row[]>([]);
  const [rels, setRels] = useState<Relationship[]>([]);
  const [newRel, setNewRel] = useState<{ direction: "out" | "in"; type: RelType; label: Label; id: string }>({ direction: "out", type: "MAY_CAUSE", label: "Cause", id: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  const idKey = ID_KEYS[label];

  const api = useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (HTTP ${res.status}).`);
    return data;
  }, []);

  // Runs an action with a busy flag and reports errors in the banner.
  async function act(fn: () => Promise<void>, success?: string) {
    setBusy(true); setMessage(undefined);
    try { await fn(); if (success) setMessage({ text: success }); }
    catch (e) { setMessage({ text: e instanceof Error ? e.message : "Something went wrong.", error: true }); }
    finally { setBusy(false); }
  }

  const loadList = useCallback(async (l: Label) => setNodes((await api(`/api/graph?label=${l}`)).nodes), [api]);

  async function openNode(l: Label, id: string) {
    const data = await api(`/api/graph?label=${l}&id=${encodeURIComponent(id)}`);
    setRows(toRows(data.node.properties));
    setRels(data.relationships);
    setSelection({ mode: "edit", id });
  }

  useEffect(() => { act(() => loadList(label)); }, [label]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = (l: Label, id: string): NodeRef => ({ label: l, id });

  function pickLabel(l: Label) {
    setLabel(l); setSelection({ mode: "none" }); setNodes([]); setFilter(""); setMessage(undefined);
    setNewRel((r) => ({ ...r, label: l }));
  }

  function startNew() {
    setRows([{ key: idKey, value: "", json: false }]); setRels([]); setSelection({ mode: "new" }); setMessage(undefined);
  }

  const save = () => act(async () => {
    const properties = fromRows(rows);
    const existing = selection.mode === "edit" ? selection.id : undefined;
    const { id } = await api("/api/graph", { action: "save", label, id: existing, properties });
    await loadList(label);
    await openNode(label, id);
  }, "Saved.");

  const remove = () => selection.mode === "edit" && confirm(`Delete ${label} "${selection.id}" and all its relationships?`) &&
    act(async () => {
      await api("/api/graph", { action: "delete", label, id: selection.id });
      setSelection({ mode: "none" });
      await loadList(label);
    }, "Deleted.");

  // "out" = this node -> other node; "in" = other node -> this node.
  const endpoints = (id: string, direction: "out" | "in", otherLabel: Label, otherId: string) =>
    direction === "out" ? { from: ref(label, id), to: ref(otherLabel, otherId) } : { from: ref(otherLabel, otherId), to: ref(label, id) };

  const addRel = () => selection.mode === "edit" && act(async () => {
    await api("/api/graph", { action: "add_relationship", type: newRel.type, ...endpoints(selection.id, newRel.direction, newRel.label, newRel.id.trim()) });
    setNewRel((r) => ({ ...r, id: "" }));
    await openNode(label, selection.id);
  }, "Relationship added.");

  const removeRel = (r: Relationship) => selection.mode === "edit" && act(async () => {
    await api("/api/graph", { action: "delete_relationship", type: r.type, ...endpoints(selection.id, r.direction, r.label as Label, r.id) });
    await openNode(label, selection.id);
  }, "Relationship removed.");

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const visible = nodes.filter((n) => JSON.stringify(n.properties).toLowerCase().includes(filter.toLowerCase()));

  return (
    <main className="shell wide">
      <Header active="graph" />

      <div className="card toolbar">
        <select value={label} onChange={(e) => pickLabel(e.target.value as Label)}>
          {LABELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <button disabled={busy} onClick={() => act(() => loadList(label))}>Reload</button>
      </div>

      {message && <p className={`card ${message.error ? "error" : "ok"}`} role={message.error ? "alert" : "status"}>{message.text}</p>}

      <div className="editor">
        <section className="card list">
          <div className="list-head">
            <input placeholder={`Filter ${nodes.length} nodes…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button disabled={busy} onClick={startNew}>+ New</button>
          </div>
          <ul>
            {visible.map((n) => {
              const text = Object.entries(n.properties).filter(([k]) => k !== idKey).map(([, v]) => String(v)).join(" · ");
              return (
                <li key={n.id}>
                  <button className={selection.mode === "edit" && selection.id === n.id ? "item on" : "item"} onClick={() => act(() => openNode(label, n.id))}>
                    <strong>{n.id}</strong>{text && <small>{text.slice(0, 90)}</small>}
                  </button>
                </li>
              );
            })}
            {!visible.length && <li className="muted empty">{nodes.length ? "No matches." : "Loading…"}</li>}
          </ul>
        </section>

        <section className="card detail">
          {selection.mode === "none" ? <p className="muted empty">Select a node to edit, or create a new one.</p> : <>
            <h2>{selection.mode === "new" ? `New ${label}` : `${label} · ${selection.id}`}</h2>
            <span className="label">Properties</span>
            <div className="props">
              {rows.map((r, i) => {
                const isId = r.key === idKey;
                return (
                  <div className="prop" key={i}>
                    <input value={r.key} readOnly={isId} placeholder="property" onChange={(e) => setRow(i, { key: e.target.value })} />
                    <textarea rows={r.value.length > 60 ? 3 : 1} value={r.value} readOnly={isId && selection.mode === "edit"} placeholder="value" onChange={(e) => setRow(i, { value: e.target.value })} />
                    {isId ? <span /> : <button type="button" className="ghost" aria-label="Remove property" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</button>}
                  </div>
                );
              })}
            </div>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setRows((rs) => [...rs, { key: "", value: "", json: false }])}>+ Add property</button>
              <span className="grow" />
              {selection.mode === "edit" && <button type="button" className="danger" disabled={busy} onClick={remove}>Delete</button>}
              <button type="button" disabled={busy} onClick={save}>{selection.mode === "new" ? "Create" : "Save changes"}</button>
            </div>

            {selection.mode === "edit" && <>
              <span className="label">Relationships</span>
              <ul className="rels">
                {rels.map((r, i) => (
                  <li key={i}>
                    <span className="pill">{r.direction === "out" ? "→" : "←"} {r.type}</span>
                    <span><small className="muted">{r.label}</small> {r.id}</span>
                    <button type="button" className="ghost" disabled={busy} aria-label="Remove relationship" onClick={() => removeRel(r)}>×</button>
                  </li>
                ))}
                {!rels.length && <li className="muted">No relationships.</li>}
              </ul>
              <div className="add-rel">
                <select value={newRel.direction} onChange={(e) => setNewRel({ ...newRel, direction: e.target.value as "out" | "in" })}>
                  <option value="out">this → other</option><option value="in">other → this</option>
                </select>
                <select value={newRel.type} onChange={(e) => setNewRel({ ...newRel, type: e.target.value as RelType })}>
                  {REL_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <select value={newRel.label} onChange={(e) => setNewRel({ ...newRel, label: e.target.value as Label })}>
                  {LABELS.map((l) => <option key={l}>{l}</option>)}
                </select>
                <input placeholder={`${ID_KEYS[newRel.label]}`} value={newRel.id} onChange={(e) => setNewRel({ ...newRel, id: e.target.value })} />
                <button type="button" disabled={busy || !newRel.id.trim()} onClick={addRel}>Add</button>
              </div>
            </>}
          </>}
        </section>
      </div>
    </main>
  );
}
