# agent.md — Standing Implementation Instructions

**These rules apply to EVERY implementation in this project. No exceptions.**

---

## Code Standards (mandatory for all code written)

Every piece of code must be:

1. **Security-first** — prioritize security in every implementation, at every layer (input validation, auth checks, data exposure, injection risks).
2. **Readable** — a new reader should follow the intent without reverse-engineering it.
3. **Well-structured** — clear separation of concerns; logic lives where a developer expects to find it.
4. **Commented where logic is non-obvious** — explain the *why*, not the *what*. Obvious code needs no comments.
5. **Easy for another developer to pick up and extend** — write for the teammate who joins tomorrow with zero context.
6. **Easy to understand** — favor clarity over cleverness.
7. **Easy to maintain** — small, focused units; single responsibility; no tangled side effects.
8. **Easy to extend later** — anticipate the next change without pre-building features nobody asked for.
9. **Performance-conscious** — reduce queries; fetch once, reuse; avoid N+1 patterns and redundant network/DB round-trips.
10. **Flag non-standard implementations** — anything unconventional (pattern, library usage, workaround) must be explicitly called out and justified in the walkthrough/notes.

## Implementation Discipline

- **Do not patch.** Think deeply before implementing — not a short-term "it works now" fix. Scrutinize the architecture properly before writing code: check data flow, edge cases, failure modes, and how this change interacts with existing behavior.
- Fix root causes, not symptoms.

## Avoid

- **Over-engineering** — no speculative abstractions, no layers that solve imaginary problems.
- **Magic values** — no unexplained literals; use named constants with clear intent.
- **Hard-coded assumptions** — no values or behavior baked in that should be derived from data, config, or context.

## Post-Implementation Check (mandatory)

After **every** implementation, verify the work against every standard above, and **include this check in the walkthrough** (and in the worklog entry). The check should state, honestly, per item — especially:

- security considerations applied
- performance/query decisions made
- any non-standard implementation flagged with justification
- whether the solution is a real architectural fix or a patch (it must not be a patch)
