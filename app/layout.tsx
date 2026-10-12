import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrackScope | Construction Defect Knowledge Graph",
  description: "Explore construction crack observations with NVIDIA AI and a Neo4j knowledge graph.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
