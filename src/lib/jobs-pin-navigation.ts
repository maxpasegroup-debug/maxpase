export function jobsPinNextPath(loginPath: string, registeredPhone: string | null): string {
  return loginPath.replace(/\/login$/, registeredPhone ? "/signup/setup-pin" : "/activate-pin");
}
