"use client";

import { createContext, ReactNode, useContext, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

// router.refresh() is fire-and-forget with no completion signal, and this app triggers it
// from many independent places (add/delete/close/roll trade, every inline edit...). Firing a
// second one while the first's RSC payload is still in flight lets them apply out of order —
// a stale/newer response landing in the wrong sequence briefly shows a state that doesn't
// match either mutation. Gating on isPending means a new call is never fired while a previous
// one is still in flight; if one arrives mid-flight, it's queued and fires the moment the
// current one commits, instead of being dropped or firing concurrently.
const ScheduleRefreshContext = createContext<(() => void) | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const requestedRef = useRef(false);

  // Reads `isPending` from this render's closure — correct because this is only ever invoked
  // from event handlers, which run against the most recently committed render, so it's never
  // stale the way a ref frozen at mount would be.
  function scheduleRefresh() {
    if (isPending) {
      requestedRef.current = true;
      return;
    }
    startTransition(() => router.refresh());
  }

  // Once an in-flight refresh actually commits, fire exactly one follow-up if anything
  // requested a refresh while we were busy — otherwise that mutation would never be shown.
  useEffect(() => {
    if (!isPending && requestedRef.current) {
      requestedRef.current = false;
      scheduleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  return (
    <ScheduleRefreshContext.Provider value={scheduleRefresh}>
      {children}
    </ScheduleRefreshContext.Provider>
  );
}

export function useScheduleRefresh(): () => void {
  const scheduleRefresh = useContext(ScheduleRefreshContext);
  if (!scheduleRefresh) {
    throw new Error("useScheduleRefresh must be used within a RefreshProvider");
  }
  return scheduleRefresh;
}
