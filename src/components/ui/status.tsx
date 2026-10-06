import { statusTone } from "@/lib/status";
export function Status({ value }: { value: string }) { return <span className={`status status-${statusTone(value)}`}>{value.replaceAll("_", " ")}</span>; }
