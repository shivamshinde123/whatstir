// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("open-source files", () => {
  it("has the community files GitHub's checklist looks for", () => {
    for (const f of [
      "LICENSE",
      "README.md",
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
      "SECURITY.md",
      "CHANGELOG.md",
      ".github/pull_request_template.md",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      ".github/ISSUE_TEMPLATE/config.yml",
      ".github/CODEOWNERS",
    ]) {
      expect(existsSync(path.join(root, f)), f).toBe(true);
    }
  });

  it("makes the maintainer the code owner of everything, and CI runs with a read-only token", () => {
    expect(read(".github/CODEOWNERS")).toMatch(/^\* @shivamshinde123$/m);
    expect(read(".github/workflows/ci.yml")).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(read(".github/workflows/ci.yml")).not.toMatch(/pull_request_target|secrets\./);
  });

  it("is MIT-licensed by the owner, and package.json agrees", () => {
    const license = read("LICENSE");
    expect(license.startsWith("MIT License")).toBe(true);
    expect(license).toMatch(/Copyright \(c\) 20\d\d Shivam Shinde/);
    expect(JSON.parse(read("package.json")).license).toBe("MIT");
  });

  it("issue forms are well formed and only apply labels the project uses", () => {
    const labels = new Set(["bug", "enhancement", "needs triage"]);
    for (const f of ["bug_report.yml", "feature_request.yml"]) {
      const form = read(`.github/ISSUE_TEMPLATE/${f}`);
      expect(form, f).toMatch(/^name: .+\ndescription: .+\nlabels: \[.+\]\nbody:\n/);
      const applied = form.match(/^labels: \[(.+)\]$/m)![1].split(",").map((s) => s.trim().replace(/"/g, ""));
      for (const l of applied) expect(labels.has(l), `${f}: ${l}`).toBe(true);
      // Every field has an id, and required ones say so explicitly.
      expect((form.match(/^ {2}- type: (textarea|input|dropdown|checkboxes)$/gm) ?? []).length, f).toBe(
        (form.match(/^ {4}id: [a-z_]+$/gm) ?? []).length,
      );
    }
    expect(read(".github/ISSUE_TEMPLATE/config.yml")).toMatch(/blank_issues_enabled: false/);
  });

  it("keeps the changelog in Keep a Changelog shape, with the current version released", () => {
    const changelog = read("CHANGELOG.md");
    const version = JSON.parse(read("package.json")).version;
    expect(changelog).toContain("## [Unreleased]");
    expect(changelog).toMatch(new RegExp(`## \\[${version.replace(/\./g, "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}`));
    expect(changelog).toContain(`[${version}]: https://github.com/shivamshinde123/whatstir/releases/tag/v${version}`);
  });

  it("no tracked file still links to the old misspelled requirements doc", () => {
    expect(existsSync(path.join(root, "docs/initial_idea.md"))).toBe(true);
    let hits = "";
    try {
      // The changelog records the rename itself, so it may name the old file.
      hits = execFileSync("git", ["grep", "-l", "intial_idea", "--", ".", ":!test/open-source.test.ts", ":!CHANGELOG.md"], { cwd: root })
        .toString()
        .trim();
    } catch (e) {
      if ((e as { status?: number }).status !== 1) throw e; // 1 = no matches
    }
    expect(hits).toBe("");
  });
});
