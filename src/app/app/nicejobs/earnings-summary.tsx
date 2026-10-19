import Link from "next/link";
import { AccessError } from "@/server/authorization/engine";
import { financeService } from "@/server/nicejobs/finance";
import { currency, formatMinor } from "@/server/nicejobs/money";
export async function EarningsSummary({ userId, base }: { userId: string; base: string }) {
  try {
    const data = await financeService.list(userId, { limit: 3 });
    return <section><h2>Earnings and payout</h2>{data.records.length ? data.records.map(w => {
      const money = (n: string) => formatMinor(n, currency.parse(w.currency));
      return <div key={w.id}><h3>{w.currency}</h3><dl><dt>Verified posted balance</dt><dd>{money(w.postedMinor)}</dd><dt>Pending incentives (not yet posted)</dt><dd>{money(w.pendingMinor)}</dd><dt>Available posted funds</dt><dd>{money(w.availableMinor)}</dd><dt>Reserved for review</dt><dd>{money(w.reservedMinor)}</dd><dt>Reserved for payout</dt><dd>{money(w.reservedForPayoutMinor)}</dd><dt>Transferred</dt><dd>Not confirmed; payout provider not configured</dd></dl></div>;
    }) : <p>No authorized wallet has been opened. This is not a zero balance.</p>}
      <p>Training levels and target changes do not withhold money already earned. Financial verification and settlement controls remain separate.</p>
      <Link href={base + "?view=worker-wallet"}>Ledger and sources</Link> / <Link href={base + "?view=worker-incentives"}>Incentive decisions</Link> / <Link href={base + "?view=worker-payouts"}>Payout status</Link>
      {data.nextCursor && <p>First three wallets shown; open Wallet for the remaining records.</p>}
    </section>;
  } catch (e) { if (e instanceof AccessError) return <section><h2>Earnings and payout</h2><p>Financial records are not authorized for your account.</p><Link href={base + "?view=worker-help"}>Ask for support</Link></section>; throw e; }
}
