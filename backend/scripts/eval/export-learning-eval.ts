import { AgentLearningService } from "../../src/services/agent-learning.service";
import { prisma } from "../../src/db/prisma";

const run = async () => {
  const limitArg = process.argv[2];
  const parsedLimit = limitArg ? Number(limitArg) : undefined;
  const limit =
    typeof parsedLimit === "number" && Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 500)
      : 100;

  const learningService = new AgentLearningService();
  const cases = await learningService.getSuggestedEvalCasesFromCorrections({ limit });

  process.stdout.write(`${JSON.stringify(cases, null, 2)}\n`);
};

run()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
