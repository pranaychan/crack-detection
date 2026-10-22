import Link from "next/link";

export function Header({ active }: { active: "analyse" | "graph" }) {
  return (
    <header>
      <span className="logo">C</span>
      <div className="grow">
        <h1>CrackScope</h1>
        <p className="muted">Image + defect type → knowledge graph → likely cause</p>
      </div>
      <nav>
        <Link href="/" className={active === "analyse" ? "on" : ""}>Analyse</Link>
        <Link href="/graph" className={active === "graph" ? "on" : ""}>Graph editor</Link>
      </nav>
    </header>
  );
}
