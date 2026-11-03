"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/session";

/**
 * The research conversation: message list, scope chip, question box, a "thinking" bubble while
 * waiting, Retry on failed answers, and New session (which asks first, since it clears the grid).
 */
export default function Chat({
  messages,
  pending,
  sendError,
  notice,
  scopeName,
  onAsk,
  onRetry,
  onReset,
}: {
  messages: Message[];
  /** The question being answered right now, if any. */
  pending: string | null;
  /** A question that couldn't be sent at all (network or server error); offered for retry. */
  sendError: string | null;
  /** A one-off problem to report, such as a failed New session. */
  notice?: string | null;
  scopeName: string;
  onAsk: (text: string) => void;
  /** Resend a question whose answer failed. */
  onRetry: (text: string, scope: Message["scope"]) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length, pending, sendError]);

  const submit = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    onAsk(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="font-semibold">Ask</h2>
        {confirming ? (
          <span className="flex items-center gap-1 text-sm">
            <span className="text-text-secondary">Clear the grid?</span>
            <button type="button" onClick={() => setConfirming(false)} className="pressable rounded-full px-2.5 py-1 hover:bg-bg">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onReset();
              }}
              className="pressable rounded-full bg-danger px-2.5 py-1 font-medium text-white"
            >
              Start over
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!messages.length || !!pending}
            className="pressable rounded-full px-2.5 py-1 text-sm text-link hover:bg-bg disabled:invisible"
          >
            New session
          </button>
        )}
      </div>
      <p className="px-4 pt-1">
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-bg px-2.5 py-0.5 text-caption">
          <span className="text-text-secondary">Scope</span>
          <span data-testid="scope" className="truncate font-medium">
            {scopeName}
          </span>
        </span>
      </p>

      {notice && (
        <p id="chat-notice" role="alert" className="px-4 pt-2 text-sm text-danger">
          {notice}
        </p>
      )}
      <ol ref={list} aria-label="Conversation" className="flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {!messages.length && !pending && (
          <li className="m-auto max-w-[16rem] text-center text-sm text-text-secondary">
            Ask about the problems these companies solve. Answers cite real companies, which then join the grid.
          </li>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <li key={m.id} className="ml-8 self-end rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-white">
              {m.content}
            </li>
          ) : m.status === "error" ? (
            <li key={m.id} role="group" aria-label="Failed answer" className="mr-8 rounded-2xl rounded-bl-md bg-bg px-3 py-2 text-sm">
              <span className="text-danger">Couldn&apos;t answer.</span>{" "}
              {messages[i - 1]?.role === "user" && i === messages.length - 1 && (
                <button
                  type="button"
                  disabled={!!pending}
                  onClick={() => onRetry(messages[i - 1].content, messages[i - 1].scope)}
                  className="pressable font-medium text-link hover:underline disabled:opacity-50"
                >
                  Retry
                </button>
              )}
            </li>
          ) : (
            <li key={m.id} className="mr-8 rounded-2xl rounded-bl-md bg-bg px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.companyIds.length > 0 && (
                <p className="mt-1 text-caption text-text-secondary">
                  Cites {m.companyIds.length} {m.companyIds.length === 1 ? "company" : "companies"}
                </p>
              )}
            </li>
          ),
        )}
        {pending && (
          <>
            <li className="ml-8 self-end rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-white">{pending}</li>
            <li role="status" className="mr-8 rounded-2xl rounded-bl-md bg-bg px-3 py-2 text-sm text-text-secondary">
              Thinking<span className="motion-safe:animate-pulse">…</span>
            </li>
          </>
        )}
        {sendError && !pending && (
          <>
            <li className="ml-8 self-end rounded-2xl rounded-br-md bg-accent/60 px-3 py-2 text-sm text-white">{sendError}</li>
            <li role="group" aria-label="Failed answer" className="mr-8 rounded-2xl rounded-bl-md bg-bg px-3 py-2 text-sm">
              <span className="text-danger">Couldn&apos;t send that.</span>{" "}
              <button type="button" onClick={() => onAsk(sendError)} className="pressable font-medium text-link hover:underline">
                Retry
              </button>
            </li>
          </>
        )}
      </ol>

      <form
        className="flex items-end gap-2 border-t border-separator p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={`Ask about ${scopeName} companies…`}
          aria-label="Question"
          className="min-h-11 flex-1 resize-none rounded-xl border border-separator bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!draft.trim() || !!pending}
          className="pressable h-9 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
