"use client";

import { useState } from "react";
import NotesList from "./NotesList";
import SiteHeader from "./SiteHeader";

/** Every saved note, newest first; each links back to its company's profile. */
export default function NotesView() {
  const [gate, setGate] = useState(false);
  return (
    <>
      <SiteHeader showSignOut={gate} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-10 sm:px-6">
        <h1 className="text-headline">Notes</h1>
        <p className="mb-6 mt-1 text-text-secondary">Everything you&apos;ve saved, across all sectors.</p>
        <NotesList onGate={setGate} />
      </main>
    </>
  );
}
