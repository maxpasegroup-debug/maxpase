import { ExecutiveView } from "./view";
export default async function ExecutivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <ExecutiveView view="overview" query={await searchParams} />; }
