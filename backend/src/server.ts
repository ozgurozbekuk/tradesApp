import { createApp } from "./app";
import { env } from "./config/env";
import { startCron } from "./cron";
import { prisma } from "./db/prisma";

const start = async () => {
  await prisma.$connect();

  const app = createApp();
  startCron();

  app.listen(env.PORT, () => {
    console.log(`Server listening on port ${env.PORT}`);
  });
};

start().catch(async (error) => {
  console.error("Failed to start server", error);
  await prisma.$disconnect();
  process.exit(1);
});
