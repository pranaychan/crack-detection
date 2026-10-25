import Link from "next/link";
import { PIPELINES, type PipelineId } from "@/lib/pipelines";

export function Header({ active }: { active: PipelineId | "graph" }) {
  return (
    <header>
      <span className="logo">C</span>
      <div className="grow">
        <h1>CrackScope</h1>
        <p className="muted">Image + defect type → knowledge graph → likely cause</p>
      </div>
      <nav aria-label="Pipelines">
        {PIPELINES.map((p) => (
          <Link key={p.id} href={p.href} data-p={p.id} className={active === p.id ? "on" : ""}>{p.label}</Link>
        ))}
        <Link href="/graph" className={active === "graph" ? "on" : ""}>Graph editor</Link>
      </nav>
    </header>
  );
}
