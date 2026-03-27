// Loads and validates environment configuration used by the backend.
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  BASE_URL: z.string().url(),
  APP_TZ: z.string().default("Europe/London"),
  BACKUP_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  BACKUP_DIR: z.string().default("./backups"),
  BACKUP_HOUR: z.coerce.number().int().min(0).max(23).default(2),
  BACKUP_MINUTE: z.coerce.number().int().min(0).max(59).default(30),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  PG_DUMP_BIN: z.string().default("pg_dump"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_SANDBOX_JOIN_CODE: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  BILLING_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AGENT_DEBUG: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AGENT_OBSERVABILITY_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AGENT_RULE_PARSER_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  USE_AGENT_FIRST_ORCHESTRATION: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  USE_CONVERSATION_V2: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  USE_V2_SEMANTIC_FRONT_DOOR: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  CONVERSATION_V2_DISABLE_V1_FALLBACK: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  CONVERSATION_V2_TEST_PHONES: z.string().optional(),
  AGENT_LEGACY_FALLBACK_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  EXPORT_TOKEN_SECRET: z.string().optional(),
  LLM_PROVIDER: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  AUTH_SESSION_SECRET: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional()
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment variables: ${errors}`);
}

export const env = parsed.data;
