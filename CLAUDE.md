# malayalikada_api — working instructions

Production-grade API for a multi-store grocery chain. Treat every change as
if it ships to a live, scaled system — not a prototype.

## Token budget (strict)

- This project runs on a tight token budget. Optimize every step for token cost.
- Delegate file reads, greps, log inspection, and command execution to a
  smaller/cheaper model (subagent) whenever the task doesn't require the
  primary model's reasoning. Reserve the primary model for design decisions,
  non-trivial logic, and anything with real ambiguity.
- Do not narrate process, restate the plan, or explain what was done after
  the fact. The user reads code, not commentary.
- No summaries of changes made unless explicitly asked. No "what's wrong /
  what's happening" walkthroughs.
- Only surface: implementation questions you cannot resolve yourself, and
  decisions that require user input. Everything else — proceed silently.
- Keep responses minimal. Code is the primary output; prose is overhead.

## Engineering bar

- SOLID principles, Clean Architecture boundaries (`domain` → `application`
  → `infrastructure` → `presentation`, dependencies point inward only).
- Prefer the most correct and optimized approach available, not the fastest
  to type. This includes query efficiency, indexing, connection pooling,
  and concurrency safety — multiple stores mean concurrent writes to shared
  stock/pricing/order state.
- No prototype-grade shortcuts: no unhandled edge cases, no missing
  transaction boundaries on multi-step writes, no N+1 queries, no unbounded
  result sets.
- Soft deletes only (`deleted_at`), per existing convention.
- Validate at system boundaries (Zod schemas in `presentation`); trust
  internal contracts elsewhere.
- No speculative abstraction — build for the current requirement, not
  imagined future ones.

## When to ask vs. proceed

- Ask only when: the task is ambiguous in a way that changes the
  implementation, or a decision has real tradeoffs the user should weigh in
  on (schema changes, breaking API changes, new dependencies).
- Do not ask for permission to read files, run read-only commands, or take
  reversible local actions.
