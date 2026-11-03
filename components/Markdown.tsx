"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Answers come from the model, so: no raw HTML (react-markdown ignores it without rehype-raw),
// no images (nothing fetched from URLs it writes), and react-markdown's default URL filter
// drops unsafe protocols such as javascript:.
const components: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
  h1: ({ children }) => <p className="mt-3 font-semibold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-3 font-semibold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-3 font-semibold first:mt-0">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-surface px-1 py-0.5 text-[0.9em]">{children}</code>,
  blockquote: ({ children }) => <blockquote className="mt-2 border-l-2 border-separator pl-3 text-text-secondary">{children}</blockquote>,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto rounded-lg border border-separator first:mt-0">
      <table className="w-full border-collapse text-left text-caption">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  tr: ({ children }) => <tr className="border-t border-separator first:border-t-0">{children}</tr>,
  th: ({ children }) => <th className="px-2 py-1.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
};

/** An assistant answer, rendered from Markdown (GitHub-flavoured, so tables work). */
export default function Markdown({ text }: { text: string }) {
  return (
    <div data-markdown className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={["img"]} unwrapDisallowed={false}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
