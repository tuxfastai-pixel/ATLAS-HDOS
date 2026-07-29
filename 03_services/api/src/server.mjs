import { createServer } from "node:http";
import { routeRequest } from "./app.mjs";

const port = Number(process.env.ATLAS_API_PORT || 3001);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const response = await routeRequest(req, url).catch((error) => ({
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
    body: JSON.stringify({ error: "Atlas API request failed", detail: error.message })
  }));

  res.writeHead(response.status, response.headers);
  res.end(response.body);
});

server.listen(port, () => {
  console.log(`Atlas API running at http://localhost:${port}`);
});
