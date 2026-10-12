import { Desk } from "@/components/desk/desk";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  return <Desk key={typeof q === "string" ? q : "workspace"} initialQuery={typeof q === "string" ? q.slice(0, 1000) : ""} />;
}
