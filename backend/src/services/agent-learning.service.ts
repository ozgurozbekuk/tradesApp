// Provides a backend service layer for a focused business domain.
import { prisma } from "../db/prisma";
import { AgentParseContext } from "../messaging/agent/agent-types";
import { OrchestratedParseResult } from "../messaging/parsers/agent-orchestrator";

type LearnedAlias = NonNullable<AgentParseContext["learnedAliases"]>[number];
type LearnedIntentHint = NonNullable<AgentParseContext["learnedIntentHints"]>[number];

const MAX_ALIAS_ROWS = 50;
const MAX_ALIAS_COUNT = 12;
const MAX_CORRECTION_ROWS = 80;
const MAX_INTENT_HINT_COUNT = 10;

const normalizePhrase = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");

const toConfidence = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0.1, Math.min(0.99, value));
};

const parseLearnedAlias = (metadata: unknown): LearnedAlias | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const phrase = typeof record.phrase === "string" ? normalizePhrase(record.phrase) : "";
  const targetType = record.targetType;
  const targetValue = typeof record.targetValue === "string" ? record.targetValue.trim() : "";

  if (!phrase || targetType !== "customer" || !targetValue) {
    return null;
  }

  return {
    phrase,
    targetType: "customer",
    targetValue,
    confidence: toConfidence(record.confidence)
  };
};

const normalizeHintPhrase = (value: string) =>
  normalizePhrase(value)
    .replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const isAgentIntentName = (value: unknown): value is LearnedIntentHint["intent"] => {
  return (
    typeof value === "string" &&
    [
      "create_customer",
      "search_customer",
      "get_customer_account",
      "create_job",
      "list_jobs",
      "update_job_status",
      "record_payment",
      "record_expense",
      "record_vendor_debt",
      "record_vendor_payment",
      "vendor_summary",
      "list_expenses",
      "list_payments",
      "list_debts",
      "get_financial_summary",
      "create_invoice",
      "export_vendor_report",
      "export_expenses_pdf",
      "export_all_records",
      "toggle_briefing",
      "subscribe",
      "help",
      "greeting",
      "confirm_action",
      "cancel_action",
      "clarification_needed",
      "unknown"
    ].includes(value)
  );
};

const parseLearnedIntentHint = (metadata: unknown): LearnedIntentHint | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const correctionText = typeof record.correctionText === "string" ? normalizeHintPhrase(record.correctionText) : "";
  const current =
    record.current && typeof record.current === "object"
      ? (record.current as Record<string, unknown>)
      : null;
  const analysisIntent = current?.analysisIntent;

  if (!correctionText || !isAgentIntentName(analysisIntent) || analysisIntent === "unknown") {
    return null;
  }

  return {
    phrase: correctionText,
    intent: analysisIntent,
    confidence: toConfidence(current?.confidence)
  };
};

export class AgentLearningService {
  async getLearnedParseContext(
    userId: string
  ): Promise<Pick<AgentParseContext, "learnedAliases" | "learnedIntentHints">> {
    const [aliasRows, correctionRows] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          userId,
          action: "agent.learning.alias_confirmed"
        },
        orderBy: {
          createdAt: "desc"
        },
        take: MAX_ALIAS_ROWS
      }),
      prisma.auditLog.findMany({
        where: {
          userId,
          action: "agent.learning.explicit_correction"
        },
        orderBy: {
          createdAt: "desc"
        },
        take: MAX_CORRECTION_ROWS
      })
    ]);

    const dedupedAliases = new Map<string, LearnedAlias>();

    for (const row of aliasRows) {
      const parsed = parseLearnedAlias(row.metadataJson);
      if (!parsed || dedupedAliases.has(parsed.phrase)) {
        continue;
      }

      dedupedAliases.set(parsed.phrase, parsed);
    }

    const dedupedIntentHints = new Map<string, LearnedIntentHint>();

    for (const row of correctionRows) {
      const parsed = parseLearnedIntentHint(row.metadataJson);
      if (!parsed) {
        continue;
      }

      const key = `${parsed.intent}:${parsed.phrase}`;
      if (!dedupedIntentHints.has(key)) {
        dedupedIntentHints.set(key, parsed);
      }
    }

    return {
      learnedAliases: Array.from(dedupedAliases.values()).slice(0, MAX_ALIAS_COUNT),
      learnedIntentHints: Array.from(dedupedIntentHints.values()).slice(0, MAX_INTENT_HINT_COUNT)
    };
  }

  async logParseDecision(input: {
    userId: string;
    phone: string;
    requestId: string;
    messageSid: string;
    rawText: string;
    parseResult: OrchestratedParseResult;
  }) {
    const parseResultMetadata =
      input.parseResult.status === "intent"
        ? {
            status: input.parseResult.status,
            source: input.parseResult.source,
            confidence: input.parseResult.confidence,
            intentType: input.parseResult.intent.type,
            normalizedText: input.parseResult.normalizedText,
            needsConfirmation: input.parseResult.needsConfirmation,
            analysisIntent: input.parseResult.analysis.intent,
            missingFields: input.parseResult.analysis.missingFields
          }
        : input.parseResult.status === "clarification"
          ? {
              status: input.parseResult.status,
              question: input.parseResult.question,
              analysisIntent: input.parseResult.analysis?.intent ?? null,
              missingFields: input.parseResult.analysis?.missingFields ?? []
            }
          : {
              status: input.parseResult.status,
              analysisIntent: input.parseResult.analysis?.intent ?? null,
              missingFields: input.parseResult.analysis?.missingFields ?? []
            };

    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: "agent.parse.decision",
        metadataJson: {
          requestId: input.requestId,
          phone: input.phone,
          messageSid: input.messageSid,
          rawText: input.rawText,
          ...parseResultMetadata
        }
      }
    });
  }

  async recordCustomerAlias(input: {
    userId: string;
    phrase: string;
    customerId: string;
    customerName: string;
    source: "disambiguation" | "successful_resolution";
    confidence?: number;
  }) {
    const phrase = normalizePhrase(input.phrase);
    if (!phrase || phrase.length < 2) {
      return;
    }

    const normalizedCustomerName = normalizePhrase(input.customerName);
    if (phrase === normalizedCustomerName) {
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: "agent.learning.alias_confirmed",
        metadataJson: {
          phrase,
          targetType: "customer",
          targetValue: input.customerName,
          targetId: input.customerId,
          source: input.source,
          confidence: toConfidence(input.confidence ?? 0.72)
        }
      }
    });
  }

  async recordExplicitCorrection(input: {
    userId: string;
    phone: string;
    correctionText: string;
    previous: {
      rawText: string;
      status: "intent" | "clarification" | "unknown";
      intentType?: string;
      analysisIntent?: string;
      confidence?: number;
    };
    current: {
      status: "intent" | "clarification" | "unknown";
      intentType?: string;
      analysisIntent?: string;
      confidence?: number;
    };
  }) {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: "agent.learning.explicit_correction",
        metadataJson: {
          phone: input.phone,
          correctionText: input.correctionText,
          previous: input.previous,
          current: input.current
        }
      }
    });
  }

  async getRecentCorrectionReview(input?: { limit?: number }) {
    const rows = await prisma.auditLog.findMany({
      where: {
        action: "agent.learning.explicit_correction"
      },
      orderBy: {
        createdAt: "desc"
      },
      take: input?.limit ?? 50
    });

    return rows.map((row) => {
      const metadata =
        row.metadataJson && typeof row.metadataJson === "object"
          ? (row.metadataJson as Record<string, unknown>)
          : {};

      const previous =
        metadata.previous && typeof metadata.previous === "object"
          ? (metadata.previous as Record<string, unknown>)
          : {};
      const current =
        metadata.current && typeof metadata.current === "object"
          ? (metadata.current as Record<string, unknown>)
          : {};

      return {
        id: row.id,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
        originalInput: typeof previous.rawText === "string" ? previous.rawText : "",
        correctionText: typeof metadata.correctionText === "string" ? metadata.correctionText : "",
        previous: {
          status: typeof previous.status === "string" ? previous.status : "unknown",
          intentType: typeof previous.intentType === "string" ? previous.intentType : null,
          analysisIntent: typeof previous.analysisIntent === "string" ? previous.analysisIntent : null,
          confidence: typeof previous.confidence === "number" ? previous.confidence : null
        },
        corrected: {
          status: typeof current.status === "string" ? current.status : "unknown",
          intentType: typeof current.intentType === "string" ? current.intentType : null,
          analysisIntent: typeof current.analysisIntent === "string" ? current.analysisIntent : null,
          confidence: typeof current.confidence === "number" ? current.confidence : null
        }
      };
    });
  }

  async getSuggestedEvalCasesFromCorrections(input?: { limit?: number }) {
    const reviewItems = await this.getRecentCorrectionReview({ limit: input?.limit ?? 50 });

    return reviewItems
      .filter((item) => item.correctionText && item.corrected.analysisIntent)
      .map((item) => ({
        source_audit_log_id: item.id,
        input: item.correctionText,
        expected_intent: item.corrected.analysisIntent as string,
        should_clarify: item.corrected.status === "clarification",
        should_disambiguate: false,
        notes: `Derived from explicit correction. Original input: ${item.originalInput}`
      }));
  }
}
