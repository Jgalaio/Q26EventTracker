"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["click", "keydown", "mousemove", "scroll", "touchstart", "pointerdown"] as const;

export function SessionTimeout() {
  const pathname = usePathname();
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const lastTouchRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (pathname === "/login") return;

    const clearTimer = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };

    const logoutExpiredSession = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      clearTimer();
      await fetch("/api/logout", { method: "POST" }).catch(() => null);
      router.replace("/login?expired=1");
    };

    const scheduleTimeout = () => {
      clearTimer();
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current);
      timeoutRef.current = window.setTimeout(logoutExpiredSession, Math.max(0, remaining));
    };

    const touchSession = async () => {
      const now = Date.now();
      if (now - lastTouchRef.current < TOUCH_THROTTLE_MS) return;
      lastTouchRef.current = now;

      const response = await fetch("/api/session/touch", { method: "POST" }).catch(() => null);
      if (response && response.status === 401) await logoutExpiredSession();
    };

    const registerActivity = () => {
      lastActivityRef.current = Date.now();
      scheduleTimeout();
      void touchSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        void logoutExpiredSession();
        return;
      }
      void touchSession();
      scheduleTimeout();
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, registerActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void touchSession();
    scheduleTimeout();

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, registerActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}
