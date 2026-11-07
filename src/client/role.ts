// 今の役割を /me から読む（サーバーの関所と同じ見方）。読めるまでは undefined、役割が無ければ null
import { useEffect, useState } from "react";
import { req } from "./make/MakeScreen";

export function useMyRole(tenant: string, again = 0): string | null | undefined {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    req<{ role: string | null }>(tenant, "/me").then(
      (m) => alive && setRole(m.role),
      () => alive && setRole(null),
    );
    return () => {
      alive = false;
    };
  }, [tenant, again]);
  return role;
}

/** 署名済み・止めたカードの本文を直せるのは監修者だけ（サーバーの cardsGate と同じ） */
export const lockedFor = (status: string, role: string | null | undefined) => (status === "signed" || status === "stopped") && role !== "supervisor";
