// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** Every source file the app and scripts run, so the check can't miss a new variable. */
function sources(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) return sources(rel);
    return /\.(ts|tsx|mts)$/.test(name) && !/\.test\./.test(name) ? [rel] : [];
  });
}

const example = read(".env.example");
const entries = Object.fromEntries(
  example
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
// Variables that are documented in a comment rather than set: they must stay unset outside tests.
const commentedOnly = ["AI_FAKE", "YC_SOURCE_URL"];

describe(".env.example", () => {
  it("documents every variable the code reads, including the ones the SDKs read implicitly", () => {
    // Read implicitly by the SDKs, or through process.env[name] in lib/ai.ts.
    const used = new Set(["OPENAI_API_KEY", "TYPESAFE_API_KEY", "AI_MODEL_ANSWER", "AI_MODEL_WRITE", "AI_MODEL_EMBED"]);
    for (const file of [...sources("lib"), ...sources("scripts"), ...sources("app"), "proxy.ts", "test/db.ts"]) {
      for (const m of read(file).matchAll(/process\.env\.([A-Z_]+)/g)) used.add(m[1]);
    }
    used.delete("NODE_ENV");
    for (const name of used) {
      expect(name in entries || (commentedOnly.includes(name) && example.includes(name)), name).toBe(true);
    }
  });

  it("holds placeholders only: secrets are empty, and only safe local defaults are filled in", () => {
    for (const key of ["DATABASE_URL", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "TYPESAFE_API_KEY", "APP_PASSWORD", "CRON_SECRET"]) {
      expect(entries[key], key).toBe("");
    }
    expect(entries.FOUNDERS_FETCH).toBe("off");
    expect(entries.AI_PROVIDER).toBe("openai");
    for (const key of ["AI_MODEL_ANSWER", "AI_MODEL_WRITE", "AI_MODEL_EMBED", "JEV_MODEL"]) expect(entries[key], key).toBe("");
    expect(entries.TEST_DATABASE_URL).toMatch(/^postgres:\/\/postgres:postgres@localhost:54329\//);
    expect(example).not.toMatch(/sk-[A-Za-z0-9_-]{10,}|supabase\.com|[0-9a-f]{32,}/);
  });

  it("is committed while .env stays git-ignored", () => {
    const ignored = read(".gitignore").split("\n").map((l) => l.trim());
    expect(ignored).toContain(".env");
    expect(ignored).not.toContain(".env.example");
    expect(ignored.some((p) => p === ".env*" || p === "*.example")).toBe(false);
  });
});

describe("README", () => {
  it("only links to files and images that exist", () => {
    const readme = read("README.md");
    const targets = [
      ...[...readme.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]),
      ...[...readme.matchAll(/src="([^"]+)"/g)].map((m) => m[1]),
    ].filter((t) => !/^(https?:|mailto:)/.test(t));
    expect(targets.length).toBeGreaterThan(5);
    for (const t of targets) expect(existsSync(path.join(root, decodeURI(t))), t).toBe(true);
  });

  it("never names a real deployment or database, only placeholders", () => {
    const readme = read("README.md");
    expect(readme).not.toMatch(/https:\/\/[a-z0-9-]+\.vercel\.app/); // placeholders read <your-app>.vercel.app
    expect(readme).not.toMatch(/postgres\.[a-z0-9]{20}|[a-z0-9]{20}\.supabase\.co/); // Supabase project refs
  });
});
