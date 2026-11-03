// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, resetData } from "@/test/db";
import { fakeEmbedding, nameGroups, writeCard } from "./ai";
import { countPending, enrich } from "./enrich";
import { run } from "./refresh";
import { SECTOR_IDS } from "./sector";

const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"), "utf8"));
const PAGE = readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-company-page.html"), "utf8");
const TOTAL = FIXTURE.length; // 37

let sql: Sql;
let drop: () => Promise<void>;
beforeAll(async () => {
  ({ sql, drop } = await createTestDb());
});
afterAll(() => drop?.());
afterEach(() => vi.unstubAllEnvs());

const feed = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
/** Load companies only (no enrichment). */
const load = (body: unknown = FIXTURE) =>
  run({ trigger: "manual", sql, fetchImpl: feed(body), retryDelaysMs: [], timeBudgetMs: 0 });

async function seedGroups(sectors: readonly string[] = [...SECTOR_IDS, "other"]) {
  for (const sector of sectors) {
    await sql`insert into subcategories (sector_id, slug, name, kind) values
      (${sector}, 'ai', 'AI', 'ai'), (${sector}, 'unclassified', 'Unclassified', 'unclassified')`;
    for (const g of await nameGroups(sector, [])) {
      await sql`insert into subcategories (sector_id, slug, name, description, kind)
        values (${sector}, ${g.slug}, ${g.name}, ${g.description}, 'problem')`;
    }
  }
}

const go = (extra: Partial<Parameters<typeof enrich>[0]> = {}) =>
  enrich({ sql, timeBudgetMs: 60_000, concurrency: 8, ...extra });

beforeEach(async () => {
  await resetData(sql);
  await load();
});

describe("enrich", () => {
  it("fills every company: embedding, card, and a problem or Unclassified group", async () => {
    await seedGroups();
    const s = await go();
    expect(s).toMatchObject({ processed: TOTAL, enriched: TOTAL, failed: 0, waiting: 0, pending: 0 });

    const [counts] = await sql`select
      count(*) filter (where embedding is not null)::int as embedded,
      (select count(*)::int from problem_cards) as cards,
      count(*) filter (where exists (
        select 1 from company_subcategories cs join subcategories sc on sc.id = cs.subcategory_id
        where cs.company_id = companies.id and sc.kind in ('problem', 'unclassified')))::int as grouped
      from companies`;
    expect(counts).toEqual({ embedded: TOTAL, cards: TOTAL, grouped: TOTAL });
  });

  it("puts each company in exactly one of {problem group, Unclassified}, within its own sector", async () => {
    await seedGroups();
    await go();
    const bad = await sql`select c.id from companies c
      left join company_subcategories cs on cs.company_id = c.id
      left join subcategories sc on sc.id = cs.subcategory_id
      group by c.id
      having count(*) filter (where sc.kind in ('problem', 'unclassified')) <> 1
          or bool_or(sc.sector_id <> c.sector_id)`;
    expect(bad).toEqual([]);
  });

  it("adds AI-centred companies to the AI group", async () => {
    await seedGroups();
    await sql`update companies set one_liner = 'An AI copilot for accountants', source_hash = 'changed'
      where id = ${FIXTURE[0].id}`;
    await go();
    const [row] = await sql`select count(*)::int as n from company_subcategories cs
      join subcategories sc on sc.id = cs.subcategory_id where cs.company_id = ${FIXTURE[0].id} and sc.kind = 'ai'`;
    expect(row.n).toBe(1);
  });

  it("stores card evidence as a JSON object, not a JSON string", async () => {
    await seedGroups();
    await go();
    const [row] = await sql`select jsonb_typeof(evidence) as kind, evidence from problem_cards limit 1`;
    expect(row.kind).toBe("object");
    expect(row.evidence).toHaveProperty("problem");
  });

  it("stores embeddings that pgvector can rank", async () => {
    await seedGroups();
    await go();
    const [{ dims }] = await sql`select vector_dims(embedding) as dims from companies limit 1`;
    expect(dims).toBe(1536);
  });

  it("does nothing on a second run for companies already enriched", async () => {
    await seedGroups();
    await go();
    const before = await sql`select company_id, generated_at from problem_cards order by 1`;
    const s = await go();
    expect(s).toMatchObject({ processed: 0, enriched: 0, pending: 0 });
    expect(await sql`select company_id, generated_at from problem_cards order by 1`).toEqual(before);
  });

  it("processes nothing with a zero time budget", async () => {
    await seedGroups();
    expect(await go({ timeBudgetMs: 0 })).toMatchObject({ processed: 0, pending: TOTAL });
  });

  it("stops when the time budget runs out and leaves the rest pending", async () => {
    await seedGroups();
    const slowCard: typeof writeCard = async (c) => {
      await new Promise((r) => setTimeout(r, 250));
      return writeCard(c);
    };
    const s = await go({ timeBudgetMs: 1500, concurrency: 1, batchSize: 5, deps: { writeCard: slowCard } });
    expect(s.processed).toBeGreaterThan(0);
    expect(s.processed).toBeLessThan(TOTAL);
    expect(s.pending).toBe(TOTAL - s.enriched);
  });

  it("keeps a failing company pending and enriches the others", async () => {
    await seedGroups();
    const victim = FIXTURE[4].id;
    const flaky: typeof writeCard = async (c) => {
      if ((c as { id?: number }).id === victim) throw new Error("model overloaded");
      return writeCard(c);
    };
    const s = await go({ deps: { writeCard: flaky } });
    expect(s).toMatchObject({ enriched: TOTAL - 1, failed: 1, pending: 1 });
    expect(s.errors).toEqual([{ companyId: victim, step: "card", message: "model overloaded" }]);

    // Only the failed step is redone next time: the embedding and assignment are kept.
    const [c] = await sql`select embedded_hash = source_hash as e, assigned_hash = source_hash as a,
      carded_hash is distinct from source_hash as card_pending from companies where id = ${victim}`;
    expect(c).toEqual({ e: true, a: true, card_pending: true });
    const embed = vi.fn();
    expect(await go({ deps: { embed } })).toMatchObject({ processed: 1, enriched: 1, pending: 0 });
    expect(embed).not.toHaveBeenCalled();
  });

  it("records the configured writing model on each problem card", async () => {
    await seedGroups();
    vi.stubEnv("AI_FAKE", "");
    vi.stubEnv("AI_MODEL_WRITE", "anthropic/claude-sonnet-5.5");
    const card = { customer: null, problem: "p", workaround: null, solution: null };
    const s = await go({
      deps: {
        embed: async (texts) => texts.map(fakeEmbedding),
        assign: async (_c, groups) => [{ subcategoryId: groups.find((g) => g.kind === "unclassified")!.id, confidence: null, explanation: "test" }],
        writeCard: async () => ({ ...card, evidence: { ...card } }),
      },
    });
    expect(s).toMatchObject({ enriched: TOTAL, failed: 0 });
    expect(await sql`select distinct model from problem_cards`).toEqual([{ model: "anthropic/claude-sonnet-5.5" }]);
  });

  it("marks every company in a batch failed when the embedding call fails, and retries next run", async () => {
    await seedGroups();
    const s = await go({ deps: { embed: vi.fn().mockRejectedValue(new Error("embeddings down")) } });
    expect(s).toMatchObject({ failed: TOTAL, enriched: 0, pending: TOTAL });
    expect(s.errors.every((e) => e.step === "embed")).toBe(true);
    expect((await sql`select count(*)::int as n from problem_cards`)[0].n).toBe(TOTAL); // other steps still ran
    expect(await go()).toMatchObject({ enriched: TOTAL, pending: 0 });
  });

  it("re-enriches only a company whose source data changed", async () => {
    await seedGroups();
    await go();
    const data = structuredClone(FIXTURE);
    data[2].long_description = "Completely new description.";
    await load(data);
    expect(await countPending(sql)).toBe(1);
    const s = await go();
    expect(s).toMatchObject({ processed: 1, enriched: 1, pending: 0 });
  });

  it("defers assignment for sectors without subcategories but still embeds and writes cards", async () => {
    await seedGroups(["b2b"]);
    const s = await go();
    const b2b = FIXTURE.filter((c: { industry: string }) => c.industry === "B2B").length;
    expect(s).toMatchObject({ processed: TOTAL, enriched: b2b, waiting: TOTAL - b2b, pending: TOTAL - b2b });
    const [row] = await sql`select count(*) filter (where embedding is null)::int as unembedded,
      (select count(*)::int from problem_cards) as cards from companies`;
    expect(row).toEqual({ unembedded: 0, cards: TOTAL });

    // Once the groups exist, only the assignment runs.
    await seedGroups([...SECTOR_IDS.filter((s) => s !== "b2b"), "other"]);
    const writeSpy = vi.fn(writeCard);
    expect(await go({ deps: { writeCard: writeSpy } })).toMatchObject({ enriched: TOTAL - b2b, pending: 0 });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("redoes only the assignment when assigned_hash is cleared, and keeps manual assignments", async () => {
    await seedGroups();
    await go();
    const id = FIXTURE[0].id;
    const [ai] = await sql`select id from subcategories where sector_id = 'b2b' and kind = 'ai'`;
    await sql`insert into company_subcategories (company_id, subcategory_id, assigned_by)
      values (${id}, ${ai.id}, 'manual') on conflict (company_id, subcategory_id) do update set assigned_by = 'manual'`;
    await sql`update companies set assigned_hash = null where sector_id = 'b2b'`;

    const writeSpy = vi.fn(writeCard);
    const embedSpy = vi.fn();
    await go({ deps: { writeCard: writeSpy, embed: embedSpy } });
    expect(writeSpy).not.toHaveBeenCalled();
    expect(embedSpy).not.toHaveBeenCalled();
    const [manual] = await sql`select assigned_by from company_subcategories where company_id = ${id} and subcategory_id = ${ai.id}`;
    expect(manual.assigned_by).toBe("manual");
  });

  it("uses the confidence threshold from app_settings", async () => {
    await seedGroups();
    await sql`update app_settings set value = '0.95' where key = 'jev_min_confidence'`;
    await go(); // the fake answers with confidence 0.9
    const [{ n }] = await sql`select count(*)::int as n from company_subcategories cs
      join subcategories sc on sc.id = cs.subcategory_id where sc.kind = 'problem'`;
    expect(n).toBe(0);
    await sql`update app_settings set value = '0.5' where key = 'jev_min_confidence'`;
  });

  it("skips companies that are missing from the source", async () => {
    await seedGroups();
    await sql`update companies set missing_since = now() where id = ${FIXTURE[0].id}`;
    expect(await go()).toMatchObject({ processed: TOTAL - 1, pending: 0 });
  });
});

describe("enrich: founders", () => {
  const pages = vi.fn(async (url: string) =>
    url.includes("circuithub") ? new Response(PAGE) : new Response("", { status: 404 }),
  );

  beforeEach(() => {
    vi.stubEnv("FOUNDERS_FETCH", "on");
    pages.mockClear();
  });

  it("fetches founders from each company's YC page", async () => {
    await seedGroups();
    const s = await go({ fetchImpl: pages as unknown as typeof fetch });
    expect(s).toMatchObject({ enriched: TOTAL, pending: 0 });
    expect(pages).toHaveBeenCalledTimes(FIXTURE.filter((c: { url?: string }) => c.url).length);
    const founders = await sql`select f.name, f.linkedin_url from founders f
      join companies c on c.id = f.company_id where c.slug = 'circuithub' order by f.name`;
    expect(founders.map((f) => f.name)).toEqual(["Ada Example", "Andrew Seddon", "Bo O'Brien & Co"]);
  });

  it("does not duplicate founders on a re-fetch, and removes founders no longer listed", async () => {
    await seedGroups();
    await go({ fetchImpl: pages as unknown as typeof fetch });
    const onlyAndrew = PAGE.replace(/,\{&quot;user_id&quot;:1,.*?\]/s, "]");
    await sql`update companies set founders_hash = null`;
    await go({
      fetchImpl: (async (u: string) =>
        u.includes("circuithub") ? new Response(onlyAndrew) : new Response("", { status: 404 })) as unknown as typeof fetch,
    });
    const names = await sql`select name from founders`;
    expect(names.map((n) => n.name)).toEqual(["Andrew Seddon"]);
  });

  it("keeps the founders step pending when the YC page errors", async () => {
    await seedGroups();
    const s = await go({ fetchImpl: (async () => new Response("", { status: 503 })) as unknown as typeof fetch });
    expect(s.failed).toBe(TOTAL);
    expect(s.errors.every((e) => e.step === "founders")).toBe(true);
    expect(s.pending).toBe(TOTAL);
  });

  it("skips founders entirely with FOUNDERS_FETCH=off", async () => {
    vi.stubEnv("FOUNDERS_FETCH", "off");
    await seedGroups();
    const s = await go({ fetchImpl: pages as unknown as typeof fetch });
    expect(pages).not.toHaveBeenCalled();
    expect(s).toMatchObject({ enriched: TOTAL, pending: 0 });
  });
});

describe("run with enrichment", () => {
  it("enriches after applying data and records the counts on the run", async () => {
    await resetData(sql);
    await seedGroups();
    const s = await run({ trigger: "manual", sql, fetchImpl: feed(FIXTURE), retryDelaysMs: [] });
    expect(s.enrichment).toMatchObject({ enriched: TOTAL, pending: 0, errors: 0 });
    const [r] = await sql`select enriched, pending from refresh_runs where id = ${s.runId}`;
    expect(r).toEqual({ enriched: TOTAL, pending: 0 });
  });
});
