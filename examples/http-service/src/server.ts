import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { requestHandler } from "./routes";

const port = Number.parseInt(process.env.PORT ?? "4340", 10);

export const httpServer = createServer(requestHandler);

export function startServer(): void {
  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`records service listening on http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
