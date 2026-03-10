import { RemindersService } from "../services/reminders.service";
import { BackupService } from "../services/backup.service";

const remindersService = new RemindersService();
const backupService = new BackupService();

let isTickRunning = false;

export const runCronTick = async (options?: { forceBriefing?: boolean; forceEveningSummary?: boolean }) => {
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;

  try {
    const now = new Date();
    await remindersService.processDueAndOverdueReminders(now);
    await remindersService.processMorningBriefings(now, { force: options?.forceBriefing === true });
    await remindersService.processEveningSummaries(now, { force: options?.forceEveningSummary === true });
    await backupService.runDailyIfDue(now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Cron tick failed", message);
  } finally {
    isTickRunning = false;
  }
};

export const startCron = () => {
  const interval = setInterval(() => {
    void runCronTick();
  }, 60_000);

  void runCronTick();

  return () => {
    clearInterval(interval);
  };
};
