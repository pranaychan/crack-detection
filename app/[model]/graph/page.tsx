import { notFound } from "next/navigation";
import { StaticModelPage } from "@/components/StaticModelPage";
import { PLACEHOLDER_IDS } from "@/lib/models";

export const dynamicParams = false;
export const generateStaticParams = () => PLACEHOLDER_IDS.map((model) => ({ model }));

export default function Page({ params }: { params: { model: string } }) {
  const id = PLACEHOLDER_IDS.find((m) => m === params.model);
  if (!id) notFound();
  return <StaticModelPage model={id} view="graph" />;
}
