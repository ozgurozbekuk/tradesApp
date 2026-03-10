import { CustomersService, CustomerPdfCandidate } from "../../services/customers.service";
import { JobResolutionCandidate, JobsService } from "../../services/jobs.service";

const customersService = new CustomersService();
const jobsService = new JobsService();

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshtein = (a: string, b: string) => {
  if (a === b) {
    return 0;
  }

  const matrix = Array.from({ length: a.length + 1 }, (_, row) =>
    Array.from({ length: b.length + 1 }, (_, col) => (row === 0 ? col : col === 0 ? row : 0))
  );

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const similarityScore = (query: string, candidate: string) => {
  const normalizedQuery = normalize(query);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedQuery === normalizedCandidate) {
    return 1000;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 850;
  }

  if (normalizedCandidate.includes(normalizedQuery)) {
    return 700;
  }

  const queryTokens = normalizedQuery.split(" ");
  const candidateTokens = normalizedCandidate.split(" ");
  const tokenHits = queryTokens.filter((token) =>
    candidateTokens.some((candidateToken) => candidateToken.startsWith(token) || candidateToken.includes(token))
  ).length;

  const tokenScore = tokenHits * 120;
  const distance = levenshtein(normalizedQuery, normalizedCandidate);
  const ratio = 1 - distance / Math.max(normalizedQuery.length, normalizedCandidate.length);
  const fuzzyScore = ratio > 0.55 ? Math.round(ratio * 250) : 0;

  return tokenScore + fuzzyScore;
};

const dedupeCandidates = (candidates: CustomerPdfCandidate[]) => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
};

export const resolveCustomerQuery = async (input: { userId: string; query: string; take?: number }) => {
  const query = input.query.trim();
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return { status: "not_found" as const, query };
  }

  const exact = await customersService.findPdfCandidatesByExactName({
    userId: input.userId,
    name: query,
    take: 8
  });
  const broad = await customersService.listResolutionCandidates({
    userId: input.userId,
    query,
    take: 80
  });

  const scored = dedupeCandidates([...exact, ...broad])
    .map((candidate) => ({
      ...candidate,
      score:
        similarityScore(normalizedQuery, candidate.name) +
        ((candidate.phone ?? "").replace(/\D/g, "").includes(query.replace(/\D/g, "")) &&
        query.replace(/\D/g, "").length >= 4
          ? 500
          : 0)
    }))
    .filter((candidate) => candidate.score >= 180)
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, input.take ?? 8);

  if (scored.length === 0) {
    return { status: "not_found" as const, query };
  }

  if (scored.length === 1 || (scored[0].score >= 930 && (scored[1]?.score ?? 0) < scored[0].score - 180)) {
    return {
      status: "single" as const,
      customer: scored[0]
    };
  }

  return {
    status: "ambiguous" as const,
    query,
    candidates: scored.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      phone: candidate.phone,
      score: candidate.score
    }))
  };
};

const dedupeJobs = (candidates: JobResolutionCandidate[]) => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
};

export const resolveJobQuery = async (input: {
  userId: string;
  query: string;
  take?: number;
  outstandingOnly?: boolean;
}) => {
  const query = input.query.trim();
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return { status: "not_found" as const, query };
  }

  const broad = await jobsService.listResolutionCandidates({
    userId: input.userId,
    query,
    take: 80,
    outstandingOnly: input.outstandingOnly
  });

  const scored = dedupeJobs(broad)
    .map((candidate) => ({
      ...candidate,
      score: Math.max(
        similarityScore(normalizedQuery, candidate.title),
        similarityScore(normalizedQuery, candidate.customerName)
      )
    }))
    .filter((candidate) => candidate.score >= 180)
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, input.take ?? 8);

  if (scored.length === 0) {
    return { status: "not_found" as const, query };
  }

  if (scored.length === 1 || (scored[0].score >= 930 && (scored[1]?.score ?? 0) < scored[0].score - 180)) {
    return {
      status: "single" as const,
      job: scored[0]
    };
  }

  return {
    status: "ambiguous" as const,
    query,
    candidates: scored.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      customerName: candidate.customerName,
      outstandingPence: candidate.outstandingPence,
      dueDate: candidate.dueDate,
      score: candidate.score
    }))
  };
};
