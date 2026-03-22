import type { EntityResolutionResult } from "../engine/contracts";

const ORDINAL_MAP: Record<string, number> = {
  "1": 0,
  "1)": 0,
  "1.": 0,
  "one": 0,
  "first": 0,
  "the first": 0,
  "the first one": 0,
  "option 1": 0,
  "number 1": 0,
  "2": 1,
  "2)": 1,
  "2.": 1,
  "two": 1,
  "second": 1,
  "the second": 1,
  "the second one": 1,
  "option 2": 1,
  "number 2": 1,
  "3": 2,
  "3)": 2,
  "3.": 2,
  "three": 2,
  "third": 2,
  "the third": 2,
  "the third one": 2,
  "option 3": 2,
  "number 3": 2
};

const normalizeText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const buildCandidateAliases = (label: string) => {
  const normalized = normalizeText(label);
  const aliases = new Set<string>([normalized]);

  const withoutParenSuffix = normalized.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (withoutParenSuffix) {
    aliases.add(withoutParenSuffix);
  }

  const beforeDashMetadata = normalized.replace(/\s+-\s+(?:added|due|balance|option)\b.*$/i, "").trim();
  if (beforeDashMetadata) {
    aliases.add(beforeDashMetadata);
  }

  return aliases;
};

export const resolveAmbiguousEntitySelection = (
  entityState: EntityResolutionResult,
  rawText: string
): EntityResolutionResult | null => {
  if (entityState.status !== "ambiguous") {
    return null;
  }

  const normalized = normalizeText(rawText);
  const ordinalIndex = ORDINAL_MAP[normalized];

  if (ordinalIndex !== undefined) {
    const candidate = entityState.candidates[ordinalIndex];
    if (!candidate) {
      return null;
    }

    return {
      status: "resolved",
      resolvedIds: {
        ...entityState.resolvedIds,
        customerId: candidate.type === "customer" ? candidate.id : entityState.resolvedIds?.customerId,
        vendorId: candidate.type === "vendor" ? candidate.id : entityState.resolvedIds?.vendorId,
        jobId: candidate.type === "job" ? candidate.id : entityState.resolvedIds?.jobId
      }
    };
  }

  const matchedCandidate = entityState.candidates.find((candidate) => buildCandidateAliases(candidate.label).has(normalized));
  if (!matchedCandidate) {
    return null;
  }

  return {
    status: "resolved",
    resolvedIds: {
      ...entityState.resolvedIds,
      customerId: matchedCandidate.type === "customer" ? matchedCandidate.id : entityState.resolvedIds?.customerId,
      vendorId: matchedCandidate.type === "vendor" ? matchedCandidate.id : entityState.resolvedIds?.vendorId,
      jobId: matchedCandidate.type === "job" ? matchedCandidate.id : entityState.resolvedIds?.jobId
    }
  };
};
