import { ExecutiveView } from "./view";
export default async function ExecutivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <><h1>Executive Command Center</h1><ExecutiveView view="overview" query={await searchParams} /></>; }
