# 08 · Agents

This is about the **Ruflo (claude-flow) agent harness** committed to this
repo's `.claude/` directory — a development-tooling layer for building
InsightWire, not a part of InsightWire's own product or runtime. Worth
being precise about that distinction: "agents" here means Claude Code
orchestration tooling, not an AI feature InsightWire ships to journalists.

## What it is

Per [ADR 0001](../decisions/0001-mcp-server-setup.md) (`e3eae22`/`a5f816d`,
the repo's second commit): a set of agent/command definitions
(`.claude/agents/`, `.claude/commands/`) covering swarm coordination,
consensus protocols, SPARC methodology phases, and memory/orchestration
patterns — installed as scaffolding for potential multi-agent development
workflows.

## Actual usage so far

**None of the InsightWire backend (Phases 1 through 6.6) was built through
this harness.** Every connector, the Connector Manager, the queue pipeline,
the trust/priority/entity-graph/merge/timeline engines, and the database
schema were built directly — plain code, direct testing, no swarm
orchestration layer in between. ADR 0001 also noted the harness's MCP
tools weren't registered in any config at the time it was written; by this
session, `claude-flow` MCP tools are available, but still unused for any
actual InsightWire work.

## Why note this at all

So a future reader doesn't assume the elaborate agent/consensus/SPARC
tooling visible in `.claude/` reflects how this codebase was actually
built, or that InsightWire itself has any agent-based architecture. If
that changes — e.g. a future phase genuinely uses multi-agent
orchestration for something (bulk connector research, parallel entity
resolution) — that decision gets its own ADR, not a retroactive edit here.
