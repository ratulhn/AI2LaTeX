"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession } from "@/components/session-provider";
import type { User } from "@/lib/types";

/**
 * Gate a page on an authenticated session.
 *
 * Renders a calm loading state until the session is resolved, and only then
 * redirects unauthenticated visitors — so a freshly created session is never
 * bounced before it settles.
 */
export function RequireAuth({ children }: { children: (user: User) => React.ReactNode }) {
  const { user, ready } = useSession();
  const router = useRouter();
  const [waited, setWaited] = React.useState(false);

  React.useEffect(() => {
    if (!ready) return;
    if (user) return;
    // give the provider one paint to settle the token before redirecting
    const t = setTimeout(() => {
      if (!user) router.replace("/auth/sign-in");
      else setWaited(true);
    }, 60);
    return () => clearTimeout(t);
  }, [ready, user, router]);

  if (!ready || (!user && !waited)) {
    return (
      <div className="grid h-screen place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={20} className="animate-spin text-watermark" />
          <p className="text-[15px] text-muted">Preparing your workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children(user)}</>;
}
