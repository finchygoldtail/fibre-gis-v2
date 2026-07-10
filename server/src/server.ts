import { createApp } from "./app.js";
import { closeDatabasePool } from "./config/database.js";
import { env } from "./config/env.js";

const app = createApp();

const server = app.listen(env.apiPort, env.apiHost, () => {
  console.log(`Alistra spatial API listening on ${env.apiHost}:${env.apiPort}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down Alistra spatial API`);
  server.close(async () => {
    await closeDatabasePool();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
