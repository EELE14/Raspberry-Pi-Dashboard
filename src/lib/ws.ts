import { getToken, getTotpSession } from "./api";
import { getApiBase } from "./serverStore";

export function wsUrl(
  path: string,
  params: Record<string, string> = {},
): string {
  const wsBase = getApiBase().replace(/^http/, "ws") + "/api";
  const session = getTotpSession();
  const q = new URLSearchParams({
    token: getToken(),
    ...(session ? { totp_session: session } : {}),
    ...params,
  }).toString();
  return `${wsBase}${path}?${q}`;
}
