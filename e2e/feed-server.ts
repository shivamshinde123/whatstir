import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";

/** The yc-oss stand-in the e2e servers refresh from (YC_SOURCE_URL), so no test needs the internet. */
export const FEED_PORT = 3199;
export const FEED_URL = `http://localhost:${FEED_PORT}`;
export const FEED_SOURCE_URL = `${FEED_URL}/all.json`;

/** CircuitHub (id 5): one founder with a verified LinkedIn, one without. */
export const E2E_FOUNDERS = [
  { name: "Andrew Seddon", title: "Founder/CEO", linkedin: "https://www.linkedin.com/in/seddonandrew/" },
  { name: "Ada Example", title: "CTO", linkedin: null },
];

/**
 * Founders on the stand-in YC company pages (YC_PAGES_URL). Rita founded companies in two sectors
 * and Sam two in B2B; their LinkedIn URLs are written differently on purpose. Other slugs are 404s.
 */
export const E2E_PAGES: Record<string, { name: string; title: string | null; linkedin: string | null }[]> = {
  circuithub: E2E_FOUNDERS,
  tremendous: [{ name: "Rita Repeat", title: "CEO", linkedin: "https://www.linkedin.com/in/rita-repeat/" }],
  quartzy: [{ name: "Rita Repeat", title: "Founder", linkedin: "https://linkedin.com/in/Rita-Repeat" }],
  rescale: [{ name: "Sam Same", title: "CTO", linkedin: "https://www.linkedin.com/in/sam-same" }],
  wireover: [{ name: "Sam Same", title: "CEO", linkedin: "https://www.linkedin.com/in/sam-same/" }],
};

/** A YC company page with its founders in the embedded `data-page` JSON, as the real one has. */
const companyPage = (founders: (typeof E2E_PAGES)[string]) => {
  const data = { props: { company: { founders: founders.map((f) => ({ full_name: f.name, title: f.title, linkedin_url: f.linkedin })) } } };
  return `<!doctype html><div id="app" data-page="${JSON.stringify(data).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></div>`;
};

/**
 * Serves test/fixtures/yc-sample.json at /all.json, and E2E_PAGES at /companies/<slug>. `PUT /__status/500` makes it answer with
 * that status instead (`PUT /__status/200` restores it), so tests can force a failed refresh.
 */
export function startFeedServer(): Promise<Server> {
  const body = readFileSync(path.join(process.cwd(), "test", "fixtures", "yc-sample.json"));
  let status = 200;
  const server = createServer((req, res) => {
    const set = req.url?.match(/^\/__status\/(\d{3})$/);
    if (req.method === "PUT" && set) {
      status = Number(set[1]);
      res.writeHead(204).end();
    } else if (req.url?.startsWith("/companies/")) {
      const founders = E2E_PAGES[req.url.slice("/companies/".length)];
      if (founders) res.writeHead(200, { "content-type": "text/html" }).end(companyPage(founders));
      else res.writeHead(404).end();
    } else if (req.url === "/all.json") {
      if (status === 200) res.writeHead(200, { "content-type": "application/json" }).end(body);
      else res.writeHead(status).end("forced failure");
    } else {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FEED_PORT, () => resolve(server));
  });
}
