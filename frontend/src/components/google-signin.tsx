"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GoogleButton } from "@/components/auth-shell";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/ui/toast";

/* -------------------------------------------------------------------------
   Google Identity Services typings

   The GIS script is loaded at runtime from accounts.google.com, so its typings
   are declared here rather than pulled from a package. Only the surface this
   component actually uses is modelled. No `any` anywhere.
   ------------------------------------------------------------------------- */

interface GoogleCredentialResponse {
  /** The JWT ID token to POST to /api/auth/google (auth-contract §7). */
  credential: string;
  select_by?: string;
}

interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
  ux_mode?: "popup" | "redirect";
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
  disableAutoSelect: () => void;
}

interface GoogleAccounts {
  id: GoogleAccountsId;
}

declare global {
  interface Window {
    google?: {
      accounts?: GoogleAccounts;
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
const DISABLED_TITLE = "Google sign-in needs GOOGLE_CLIENT_ID configured on the backend";

let gisPromise: Promise<void> | null = null;

/** Load the GIS client exactly once per page load. */
function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error("Google Identity Services did not initialise."));
    };
    const onError = () => reject(new Error("Could not load the Google sign-in script."));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((err: unknown) => {
    // Allow a retry on the next mount after a network failure.
    gisPromise = null;
    throw err;
  });

  return gisPromise;
}

export interface GoogleSignInProps {
  /** Button copy; sign-in and sign-up pages pass their own. */
  label?: string;
  /** Width handed to GIS renderButton so it lines up with the form column. */
  width?: number;
}

/**
 * Real Google sign-in (docs/auth-contract.md §7).
 *
 * Reads `GET /api/health` once; only when `auth.googleEnabled` is true does it
 * load Google Identity Services and render the official button. When disabled
 * it renders a *disabled* button that explains what the backend is missing — it
 * never falls back to a fake/demo login.
 */
export function GoogleSignIn({ label = "Continue with Google", width = 328 }: GoogleSignInProps) {
  const toast = useToast();
  const { googleSignIn } = useSession();
  const router = useRouter();
  const [state, setState] = React.useState<"loading" | "enabled" | "disabled" | "error">("loading");
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const buttonHost = React.useRef<HTMLDivElement | null>(null);
  const adoptedRef = React.useRef(false);

  const handleCredential = React.useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response?.credential || adoptedRef.current) return;
      adoptedRef.current = true;
      setBusy(true);
      try {
        // The backend verifies the ID token; the provider adopts the session.
        await googleSignIn(response.credential);
        router.push("/dashboard");
      } catch (err) {
        adoptedRef.current = false;
        setBusy(false);
        toast.error(
          "Google sign-in failed",
          err instanceof Error ? err.message : "Please try again.",
        );
      }
    },
    [googleSignIn, router, toast],
  );

  // Capability discovery: read /api/health once.
  React.useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((health) => {
        if (cancelled) return;
        const auth = health.auth;
        if (auth?.googleEnabled && auth.googleClientId) {
          setClientId(auth.googleClientId);
          setState("enabled");
        } else {
          setState("disabled");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render the official button once GIS is available and we know the client id.
  React.useEffect(() => {
    if (state !== "enabled" || !clientId) return;
    let cancelled = false;

    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled) return;
        const gid = window.google?.accounts?.id;
        if (!gid || !buttonHost.current) {
          setState("error");
          return;
        }
        gid.initialize({
          client_id: clientId,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        buttonHost.current.replaceChildren();
        gid.renderButton(buttonHost.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: label.toLowerCase().includes("sign up") ? "signup_with" : "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState("error");
        toast.error(
          "Google sign-in unavailable",
          err instanceof Error ? err.message : undefined,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [state, clientId, label, width, handleCredential, toast]);

  if (state === "enabled") {
    return (
      <div className="relative h-10 w-full">
        <div
          ref={buttonHost}
          data-testid="google-signin-button"
          className="flex h-10 w-full items-center justify-center overflow-hidden rounded-[8px]"
          aria-busy={busy}
        />
        {busy ? (
          <div className="absolute inset-0 grid place-items-center rounded-[8px] bg-white/80">
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-[1.8px] border-slate-300 border-t-ink"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <GoogleButton
      label={state === "error" ? "Google sign-in unavailable" : label}
      disabled
      title={DISABLED_TITLE}
    />
  );
}
