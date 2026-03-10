# Agent Quality Workflow

## 1) Offline Eval Set
- Dataset file: `scripts/eval/agent-eval-set.json`
- Runner: `npm run eval:agent`
- Output includes expected vs actual intent, source, confidence, pass/fail.

## 2) Structured Observability
- Enable with `AGENT_OBSERVABILITY_ENABLED=true`.
- Agent emits JSON events to stdout:
  - `agent.parse.result`
  - `tool.execute`
- Each event includes a request id for traceability.

## 3) Prompt + Canonical Format
- LLM fallback prompt enforces canonical commands:
  - `NEW JOB ...`
  - `PAYMENT ...`
  - `Find ...`
  - list/report/export/briefing commands
- LLM output is validated before execution.

## 4) Tool Layer
- Router executes deterministic operations via internal tools (`ToolExecutor`).
- Tools call existing service layer, not direct business logic in LLM.
