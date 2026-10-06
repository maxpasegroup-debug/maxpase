import { requireSession } from "@/server/auth/guards";
import { accountPreferences } from "@/server/account/preferences";
import { TimezoneForm } from "./timezone-form";
export default async function AccountPage() {
  const session = await requireSession(), account = await accountPreferences.account(session.userId);
  return <section className="account-page"><h1>Account preferences</h1><dl className="record-details"><div><dt>Account</dt><dd>{account.name}</dd></div><div><dt>Email</dt><dd>{account.email}</dd></div></dl><TimezoneForm timezone={account.timezone}/></section>;
}
