"use client";

import { useState, type FormEvent } from "react";
import { safeNext } from "@/lib/safe-next";

const goTo = (url: string) => window.location.replace(url);

export default function LoginForm({ navigate = goTo }: { navigate?: (url: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        navigate(safeNext(new URLSearchParams(window.location.search).get("next")));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Something went wrong. Try again.");
      setPassword("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-3" noValidate>
      <label htmlFor="password" className="sr-only">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? "login-error" : undefined}
        placeholder="Password"
        className="h-12 rounded-xl border border-separator bg-surface px-4 text-base outline-none transition-colors focus:border-accent"
      />
      {error && (
        <p id="login-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !password}
        className="pressable h-12 rounded-full bg-accent font-medium text-white disabled:opacity-40"
      >
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
