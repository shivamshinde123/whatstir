import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";

/** The yc-oss stand-in the e2e servers refresh from (YC_SOURCE_URL), so no test needs the internet. */
export const FEED_PORT = 3199;
export const FEED_URL = `http://localhost:${FEED_PORT}`;
export const FEED_SOURCE_URL = `${FEED_URL}/all.json`;

/**
 * Serves test/fixtures/yc-sample.json at /all.json. `PUT /__status/500` makes it answer with
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
