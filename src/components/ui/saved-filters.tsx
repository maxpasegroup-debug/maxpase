"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { filterValues, restoreFilter, savedFilterInput, savedFilterList, savedFilterStorageKey } from "@/lib/work-list";
type Saved = { name: string; filters: Record<string, string> };
export function SavedFilters({ userId }: { userId: string }) {
  const path = usePathname(), query = useSearchParams(), router = useRouter();
  const key = savedFilterStorageKey(userId, path, new URLSearchParams(query.toString()));
  const [items, setItems] = useState<Saved[]>([]), [name, setName] = useState(""), [selected, setSelected] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    try { const value = savedFilterList.safeParse(JSON.parse(localStorage.getItem(key) ?? "[]")); setItems(value.success ? value.data : []); }
    catch { setMessage("Saved filters are unavailable in this browser."); }
    setSelected("");
  }, [key]);
  function store(next: Saved[]) {
    try { localStorage.setItem(key, JSON.stringify(savedFilterList.parse(next))); setItems(next); return true; }
    catch { setMessage("Could not save filters. This browser may block local storage, or the ten-filter limit was reached."); return false; }
  }
  return <details className="saved-filter-panel"><summary>Saved filters ({items.length})</summary><section className="saved-filters" aria-label="Saved filters"><label>Saved filters<select value={selected} onChange={e => { setSelected(e.target.value); const item = items.find(i => i.name === e.target.value); if (item) router.push(`${path}?${restoreFilter(new URLSearchParams(query.toString()), item.filters)}`); }}><option value="">Choose a saved filter</option>{items.map(i => <option key={i.name}>{i.name}</option>)}</select></label><label>Filter name<input value={name} maxLength={60} onChange={e => setName(e.target.value)}/></label><button type="button" className="icon-button" title="Save current filters in this browser" aria-label="Save current filters" onClick={() => { const parsed = savedFilterInput.safeParse({ name, filters: filterValues(new URLSearchParams(query.toString())) }); if (!parsed.success) { setMessage("Enter a filter name of up to 60 characters."); return; } if (store([...items.filter(i => i.name !== parsed.data.name), parsed.data])) { setMessage("Filter saved in this browser."); setName(""); } }}><Save size={18}/></button><button type="button" className="icon-button" disabled={!selected} title="Delete selected saved filter" aria-label="Delete saved filter" onClick={() => { if (store(items.filter(i => i.name !== selected))) { setSelected(""); setMessage("Filter deleted."); } }}><Trash2 size={18}/></button>{message && <p role="status">{message}</p>}</section></details>;
}
