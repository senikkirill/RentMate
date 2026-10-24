import { createServer } from "node:http";
import { tables, tenantColumn } from "@rentmate/database";
import { restRoutes } from "./routes.js";
import { legacyActions } from "./legacy-action-map.js";

const port = Number(process.env.PORT ?? 4000);

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  if (req.method === "GET" && (url === "/health" || url === "/api/health")) {
    const body = JSON.stringify({
      ok: true,
      service: "rentmate-api",
      tenantColumn,
      tables,
      restRouteCount: Object.keys(restRoutes).length,
      legacyActionCount: legacyActions.length,
      note: "Skeleton only. Production traffic still uses legacy Edge Function api.",
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not implemented" }));
});

server.listen(port, () => {
  console.log(`RentMate API skeleton http://127.0.0.1:${port}/api/health`);
});
