"use client";

import { useEffect, useRef, useState } from "react";
import type { Action } from "@/lib/answer";
import type { Message } from "@/lib/session";
import { suggestionsFor } from "@/lib/suggestions";
import Markdown from "./Markdown";

const ACTIONS: { id: Action; label: string; placeholder: (scope: string) => string }[] = [
  { id: "ask", label: "Ask", placeholder: (s) => `Ask about ${s} companies…` },
  { id: "explore", label: "Explore", placeholder: () => "Describe a problem to explore…" },
  { id: "challenge", label: "Challenge", placeholder: () => "Describe your idea to challenge…" },
];
const ACTION_TAG: Partial<Record<Action, string>> = { explore: "Explore", challenge: "Challenge" };

/** "Explore" / "Challenge" label on a bubble; nothing for a plain question. */
const Tag = ({ action }: { action: Action }) =>
  ACTION_TAG[action] ? (
    <span data-testid="action-tag" className="mb-0.5 block text-caption font-semibold uppercase tracking-wide opacity-75">
      {ACTION_TAG[action]}
    </span>
  ) : null;

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
  selection = false,
  onClearScope,
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
  /** True while questions are about selected companies (changes the suggestions). */
  selection?: boolean;
  /** Shown as × on the scope chip when the scope is a selection: back to the sector or group. */
  onClearScope?: () => void;
  onAsk: (text: string, action: Action) => void;
  /** Resend a question whose answer failed. */
  onRetry: (text: string, action: Action, scope: Message["scope"]) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [action, setAction] = useState<Action>("ask");
  const [failedAction, setFailedAction] = useState<Action>("ask");
  const [confirming, setConfirming] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length, pending, sendError]);

  const send = (text: string) => {
    setFailedAction(action);
    onAsk(text, action);
  };
  const submit = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    send(text);
  };
  const suggestions = suggestionsFor(action, scopeName, selection);
  const empty = !messages.length && !pending && !sendError;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="text-tag text-text-secondary">Ask</h2>
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
          {onClearScope && (
            <button
              type="button"
              onClick={onClearScope}
              aria-label="Stop asking about the selection"
              className="pressable -mr-1 ml-0.5 rounded-full px-1 text-text-secondary hover:text-text"
            >
              ×
            </button>
          )}
        </span>
      </p>

      {notice && (
        <p id="chat-notice" role="alert" className="px-4 pt-2 text-sm text-danger">
          {notice}
        </p>
      )}
      <ol ref={list} aria-label="Conversation" className="flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {empty && (
          <li className="m-auto w-full max-w-sm text-center">
            <p className="text-sm text-text-secondary">
              Ask about the problems these companies solve. Answers cite real companies, which then join the grid.
            </p>
            <div role="group" aria-label="Suggestions" className="mt-4 flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="pressable rounded-xl bg-bg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/10"
                >
                  {s}
                </button>
              ))}
            </div>
          </li>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <li key={m.id} data-action={m.action} className="ml-8 self-end rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-white">
              <Tag action={m.action} />
              {m.content}
            </li>
          ) : m.status === "error" ? (
            <li key={m.id} role="group" aria-label="Failed answer" className="mr-8 rounded-2xl rounded-bl-md bg-bg px-3 py-2 text-sm">
              <span className="text-danger">Couldn&apos;t answer.</span>{" "}
              {messages[i - 1]?.role === "user" && i === messages.length - 1 && (
                <button
                  type="button"
                  disabled={!!pending}
                  onClick={() => onRetry(messages[i - 1].content, messages[i - 1].action, messages[i - 1].scope)}
                  className="pressable font-medium text-link hover:underline disabled:opacity-50"
                >
                  Retry
                </button>
              )}
            </li>
          ) : (
            <li key={m.id} data-action={m.action} className="mr-8 rounded-2xl rounded-bl-md bg-bg px-3 py-2 text-sm">
              <Tag action={m.action} />
              <Markdown text={m.content} />
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
              <button type="button" onClick={() => onAsk(sendError, failedAction)} className="pressable font-medium text-link hover:underline">
                Retry
              </button>
            </li>
          </>
        )}
      </ol>

      {!empty && (
        <div
          role="group"
          aria-label="Suggestions"
          className="flex gap-1.5 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!!pending}
              onClick={() => send(s)}
              title={s}
              className="pressable max-w-64 shrink-0 truncate rounded-full border border-separator bg-bg px-3 py-1 text-caption transition-colors hover:bg-accent/10 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div role="group" aria-label="Action" className="mx-3 mt-1 flex rounded-full bg-bg p-0.5 text-sm">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={action === a.id}
            onClick={() => setAction(a.id)}
            className="pressable flex-1 rounded-full py-1 text-text-secondary transition-colors aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-text aria-pressed:shadow-sm"
          >
            {a.label}
          </button>
        ))}
      </div>
      <form
        className="flex items-end gap-2 p-3"
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
          placeholder={ACTIONS.find((a) => a.id === action)!.placeholder(scopeName)}
          aria-label="Question"
          id="question"
          className="min-h-11 flex-1 resize-none rounded-xl border border-separator bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!draft.trim() || !!pending}
          aria-label="Send"
          className="pressable flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-white disabled:opacity-40"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
