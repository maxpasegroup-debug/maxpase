import { workspaceReturnKeys } from "@/lib/workspace-navigation";
export function WorkspaceReturnFields({ query }: { query: Record<string, string | string[] | undefined> }) {
  return <>{workspaceReturnKeys.map(key => typeof query[key] === "string" && query[key] ? <input key={key} type="hidden" name={key} value={query[key]}/> : null)}</>;
}
