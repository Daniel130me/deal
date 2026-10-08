# todo.md — Standing Standards Checklist (derived from `agent.md`)

**Purpose:** This file converts `agent.md` into a per-task checklist. For **every** implementation in this project, walk this list before, during, and after coding. Section D (the post-implementation check) is **mandatory** and must be pasted — answered honestly, per item — into the walkthrough **and** the worklog entry.

**How to use:**
1. **Before coding** — read Sections A–C; scrutinize the architecture (B1) before writing any code.
2. **While coding** — keep the checks in mind; tick them off as they apply.
3. **After coding** — complete Section D, include it in the walkthrough and worklog entry, then commit.

---

## A. Code Standards (apply to all code written)

- [ ] **A1. Security-first** — security prioritized at every layer:
  - [ ] Input validation applied (all external/untrusted input checked)
  - [ ] Auth/authz checks in place (every protected path verified)
  - [ ] No data over-exposure (responses leak nothing they shouldn't)
  - [ ] No injection risks (SQL/Prisma, shell, XSS, etc.)
- [ ] **A2. Readable** — a new reader can follow the intent without reverse-engineering the code.
- [ ] **A3. Well-structured** — clear separation of concerns; logic lives where a developer expects to find it.
- [ ] **A4. Commented where logic is non-obvious** — comments explain the *why*, not the *what*; obvious code carries no comment noise.
- [ ] **A5. Handover-ready** — easy for another developer (zero context) to pick up and extend.
- [ ] **A6. Easy to understand** — clarity favored over cleverness; no clever tricks that need decoding.
- [ ] **A7. Easy to maintain** — small, focused units; single responsibility; no tangled side effects.
- [ ] **A8. Easy to extend later** — anticipated the next change *without* pre-building features nobody asked for.
- [ ] **A9. Performance-conscious** —
  - [ ] Queries reduced (fetch once, reuse)
  - [ ] No N+1 patterns
  - [ ] No redundant network/DB round-trips
- [ ] **A10. Non-standard implementations flagged** — anything unconventional (pattern, library usage, workaround) is explicitly called out **and justified** in the walkthrough/notes. *List them here:*

---

## B. Implementation Discipline

- [ ] **B1. No patches — think first.** Architecture scrutinized *before* implementing:
  - [ ] Data flow traced end-to-end
  - [ ] Edge cases considered
  - [ ] Failure modes considered
  - [ ] Interaction with existing behavior checked
  - [ ] Solution is a deliberate long-term design, not a short-term "it works now" fix
- [ ] **B2. Root cause fixed, not symptoms.** The underlying cause is addressed — no symptom-masking workarounds.

---

## C. Avoid

- [ ] **C1. No over-engineering** — no speculative abstractions; no layers that solve imaginary problems.
- [ ] **C2. No magic values** — every non-obvious literal is a named constant with clear intent. *Flag any remaining literals and justify:*
- [ ] **C3. No hard-coded assumptions** — nothing baked in that should be derived from data, config, or context.

---

## D. Post-Implementation Check (mandatory — include in walkthrough AND worklog)

> Answer each honestly, per item. "Honest" means stating gaps and risks, not ticking boxes for the sake of it.

- [ ] **D1. Security considerations applied** — *state which, and where.*
- [ ] **D2. Performance / query decisions made** — *state which, and why.*
- [ ] **D3. Non-standard implementations flagged with justification** — *list each, or state "none".*
- [ ] **D4. Real architectural fix, not a patch** — *state why this is a root-cause fix. If it is a patch, stop and redesign.*
- [ ] **D5. All A/B/C items above verified** — *any unticked item must be explained or fixed before completion.*

---

## Copy-paste template for walkthrough / worklog

```text
Post-Implementation Check (per agent.md / todo.md):
- Security: <what was applied, where>
- Performance: <query/perf decisions made>
- Non-standard: <flagged items + justification, or "none">
- Fix vs patch: <why this is a root-cause architectural fix>
- Standards A1–C3: <all verified / exceptions explained>
```
