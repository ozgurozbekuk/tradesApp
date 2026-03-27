// Provides a backend service layer for a focused business domain.
import { execFile } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";
import path from "path";
import { env } from "../config/env";

const execFileAsync = promisify(execFile);

const getDateKey = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date);
};

const getHourMinute = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { hour, minute };
};

export class BackupService {
  private lastRunDayKey: string | null = null;

  async runDailyIfDue(now = new Date()) {
    if (env.BACKUP_ENABLED !== true) {
      return;
    }

    const timezone = env.APP_TZ;
    const currentDay = getDateKey(now, timezone);
    const { hour, minute } = getHourMinute(now, timezone);

    if (hour !== env.BACKUP_HOUR || minute !== env.BACKUP_MINUTE) {
      return;
    }

    if (this.lastRunDayKey === currentDay) {
      return;
    }

    await this.createBackup(now);
    this.lastRunDayKey = currentDay;
  }

  async createBackup(now = new Date()) {
    await fs.mkdir(env.BACKUP_DIR, { recursive: true });

    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(env.BACKUP_DIR, `tradesapp-${stamp}.dump`);

    try {
      await execFileAsync(env.PG_DUMP_BIN, ["--dbname", env.DATABASE_URL, "--format=custom", "--file", filePath]);
      await this.cleanupOldBackups(now);
      console.info("Backup completed", { filePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn("Backup failed", message);
    }
  }

  async cleanupOldBackups(now = new Date()) {
    const files = await fs.readdir(env.BACKUP_DIR);
    const cutoff = now.getTime() - env.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(env.BACKUP_DIR, file);
      const stats = await fs.stat(filePath);

      if (stats.isFile() && stats.mtime.getTime() < cutoff) {
        await fs.unlink(filePath);
      }
    }
  }
}
