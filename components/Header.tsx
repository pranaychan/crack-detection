import Link from "next/link";
import { MODELS, type ModelId } from "@/lib/models";

export function Header({ model, view }: { model: ModelId; view: "analyse" | "graph" }) {
  const current = MODELS.find((m) => m.id === model)!;
  return (
    <header>
      <span className="logo">C</span>
      <div className="grow">
        <h1>CrackScope</h1>
        <p className="muted">Image + defect type → knowledge graph → likely cause</p>
      </div>
      <nav aria-label="Models" className="models">
        {MODELS.map((m) => (
          <Link key={m.id} href={m.href} data-p={m.id} className={m.id === model ? "on" : ""}>{m.label}</Link>
        ))}
      </nav>
      <nav aria-label={`${current.label} views`} className="views">
        <Link href={current.href} className={view === "analyse" ? "on" : ""}>Analyse</Link>
        <Link href={current.graphHref} className={view === "graph" ? "on" : ""}>Graph editor</Link>
      </nav>
    </header>
  );
}
