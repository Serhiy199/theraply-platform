"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function IntegrationStartForm({ action, intent, requestId, children }: {
  action: string;
  intent: "google-connect" | "stripe-connect";
  requestId: string;
  children: ReactNode;
}) {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => { submitting.current = false; setPending(false); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form method="post" action={action} onSubmit={event => {
      if (submitting.current) { event.preventDefault(); return; }
      submitting.current = true;
      setPending(true);
    }}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" fullWidth loading={pending} loadingText="Opening connection..." aria-busy={pending}
        className="border border-slate-900 !bg-slate-900 !text-white shadow-sm shadow-slate-950/10">
        {children}
      </Button>
    </form>
  );
}
