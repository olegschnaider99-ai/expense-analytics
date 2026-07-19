"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("Couldn't start Google sign-in. Try again.");
      setPending(false);
    }
    // On success the browser navigates away to Google, so no further
    // state update happens here.
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
      >
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
