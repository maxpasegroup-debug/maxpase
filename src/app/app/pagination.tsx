import Link from "next/link";
import { ArrowRight, ChevronsLeft } from "lucide-react";

export function Pagination({ path, query, nextCursor }: { path: string; query: Record<string, string | undefined>; nextCursor: string | null }) {
  const href = (cursor?: string) => {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value && key !== "cursor") values.set(key, value);
    if (cursor) values.set("cursor", cursor);
    return path + (values.size ? "?" + values.toString() : "");
  };
  if (!query.cursor && !nextCursor) return null;
  return <nav className="list-toolbar" aria-label="Result pages">
    {query.cursor && <Link className="button secondary" href={href()} title="First page" aria-label="First page"><ChevronsLeft size={18}/></Link>}
    {nextCursor && <Link className="button secondary" href={href(nextCursor)} title="Next page" aria-label="Next page"><ArrowRight size={18}/></Link>}
  </nav>;
}
