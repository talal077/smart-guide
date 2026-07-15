"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { getUnreadNotificationCount, onNotificationsChanged } from "@/lib/notifications";
import { getNotificationPollingMs } from "@/lib/notificationSettings";

// Realtime isn't available for public.notifications on this project (verified live:
// the table isn't in the supabase_realtime publication, subscriptions connect but
// never receive events), so the badge relies on a light poll plus an in-tab event
// bus (see onNotificationsChanged) for instant updates on same-tab reads/creates.
// The interval itself is configurable from Settings -> إعدادات الإشعارات (bounded
// 15-300s there); falls back to 45s if that setting can't be read.
const FALLBACK_POLL_INTERVAL_MS = 45_000;

export default function NotificationBell({ active }: { active: boolean }) {
  const [count, setCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const next = await getUnreadNotificationCount();
        if (mountedRef.current) setCount(next);
      } catch {
        // RLS/auth not ready yet (e.g. right after login) — leave the badge as-is,
        // the next poll tick will recover it.
      }
    }

    void refresh();
    const unsubscribe = onNotificationsChanged(refresh);

    getNotificationPollingMs()
      .then((ms) => {
        if (!mountedRef.current) return;
        interval = setInterval(refresh, ms);
      })
      .catch(() => {
        if (mountedRef.current) interval = setInterval(refresh, FALLBACK_POLL_INTERVAL_MS);
      });

    return () => {
      mountedRef.current = false;
      if (interval) clearInterval(interval);
      unsubscribe();
    };
  }, []);

  return (
    <Link
      href="/notifications"
      className={`relative rounded-xl p-2 ${active ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-700"}`}
      aria-label={count > 0 ? `الإشعارات (${count} غير مقروء)` : "الإشعارات"}
    >
      <Bell size={20} />
      {count > 0 ? (
        <span className="absolute -left-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
