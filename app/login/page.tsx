import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in · Whatstir" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-surface px-4 py-16 dark:bg-bg">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-bg p-8 shadow-card dark:bg-surface">
        <h1 className="text-headline text-center">Whatstir</h1>
        <p className="mt-2 text-center text-text-secondary">Enter the password to continue.</p>
        <LoginForm />
      </div>
    </main>
  );
}
