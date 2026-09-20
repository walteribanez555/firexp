# @fire-stick/story-graph

Single source of truth for the branching-story engine logic. Pure TypeScript — no I/O, no AWS, no network. Replaces the duplicated implementations in the Kotlin TV app (`StoryEngine.kt`) and the relay service (`rooms.service.ts`).

---

## Condition AST

The `when` field on a `StoryVariant` is currently stored as a legacy string (`"confident <= -2 && united >= 1"` or `"default"`). This package defines a JSON-serialisable AST that any language can produce or consume.

```ts
type Op = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';

interface Clause {
  flag:  string;   // flag name, e.g. "confident"
  op:    Op;
  value: number;   // always an integer
}

type Cond =
  | 'default'          // sentinel — always evaluates to true; must be last variant
  | Clause             // single comparison
  | { all: Clause[] }  // logical AND of clauses (produced by "&&" legacy strings)
  | { any: Clause[] }  // logical OR  of clauses (dashboard / new content only)
```

Operator mapping (legacy string → AST op):

| String | AST op |
|--------|--------|
| `>=`   | `gte`  |
| `<=`   | `lte`  |
| `>`    | `gt`   |
| `<`    | `lt`   |
| `==`   | `eq`   |
| `!=`   | `ne`   |

---

## Exported functions

### Condition parsing

```ts
parseWhen(expr: string): Cond
```
Parse a legacy `when` string into a structured AST. Throws on malformed clauses. Round-trips with `whenToString`.

```ts
whenToString(cond: Cond): string
```
Serialise a `Cond` back to a human-readable string. `{ all }` → `&&`-joined, `{ any }` → `||`-joined. Used by the dashboard for display.

---

### Engine functions

```ts
evaluateWhen(cond: Cond | string, flags: Flags): boolean
```
Evaluate a condition against the current flag state. Accepts a pre-parsed AST or a legacy string (parsed on the fly). Missing flags default to `0`.

```ts
applySet(flags: Flags, set: FlagSet): Flags
```
Return a **new** `Flags` object with the `FlagSet` mutations applied. String values are relative (`"+1"` adds 1); number values are absolute assignments. The input object is never mutated.

```ts
selectVariant(chapter: StoryChapter, flags: Flags): StoryVariant | null
```
Return the first variant whose `when` is satisfied by `flags`. Returns `null` only when no variant matches (the last variant should always be `"default"`).

```ts
resolveVotes(
  votes: Record<string, string>,
  options: DecisionOption[],
): string
```
Resolve a viewer-to-gesture vote map into the winning gesture. Rules (mirror of `StoryEngine.kt`):
1. Empty tally → `"default"`.
2. Count votes per gesture.
3. Single unambiguous winner **and** gesture is in `options` → return that gesture.
4. Tie or unknown gesture → `"default"`.

```ts
findShadowedVariants(chapter: StoryChapter): StoryVariant[]
```
Return variants that can never be selected because they appear after a `"default"` variant. Structural check only (does not attempt satisfiability analysis).

```ts
findInconsequentialDecisions(episode: EpisodeDetail): { chapterId: string; decisionId: string }[]
```
Return decisions whose outcome can never change a later chapter's variant selection.

**Heuristic:** A decision is inconsequential if none of the flag keys it mutates (across all options + default) appear in the `when` expressions of any later chapter's variants. This is a conservative under-approximation — no false positives (a truly consequential decision is never reported), but it may miss decisions whose flags appear in later `when` expressions that the flags can never actually flip given reachable ranges.

```ts
reachableEndings(episode: EpisodeDetail): string[]
```
Walk all combinations of questionnaire answers and chapter decision outcomes (bounded enumeration: default + each option per decision, applied sequentially) and return the sorted set of final-chapter variant `tag`s (falling back to `when` when `tag` is absent).

---

### Validation

```ts
validateEpisode(episode: unknown): { ok: boolean; issues: ValidationIssue[] }
```
Validate an `EpisodeDetail` against `GraphSchema` (Zod) plus semantic rules.

```ts
interface ValidationIssue {
  code:     string;
  message:  string;
  path:     string;           // dot-notation path into the episode object
  severity: 'error' | 'warning';
}
```

**Errors** (`ok = false`):
- `SCHEMA_VIOLATION` — Zod structural mismatch.
- `INVALID_WHEN` — `when` expression cannot be parsed.
- `MISSING_DEFAULT_VARIANT` — last variant in a chapter is not `"default"`.
- `SHADOWED_VARIANT` — variant appears after a `"default"` (unreachable).

**Warnings** (`ok = true`):
- `INCONSEQUENTIAL_DECISION` — decision flags never affect later `when` checks.
- `ZERO_DURATION_VARIANT` — variant has `out <= in` (zero or inverted segment).

The Zod schemas are also exported individually:
`GraphSchema`, `StoryGraphSchema`, `StoryChapterSchema`, `StoryVariantSchema`, `ChapterDecisionSchema`, `DecisionOptionSchema`.

---

## Fixture format (TS ↔ Kotlin parity contract)

Each `fixtures/*.json` file is language-agnostic JSON that both this package's Vitest suite and the future Kotlin unit tests load to assert identical behaviour.

| File | Tests |
|------|-------|
| `evaluate-when.json` | `evaluateWhen` with various operators and compound clauses |
| `apply-set.json` | `applySet` relative and absolute mutations |
| `select-variant.json` | `selectVariant` first-match and default fall-through |
| `resolve-votes.json` | `resolveVotes` majority, tie, empty, unknown gesture |
| `shadowed-variants.json` | `findShadowedVariants` structural check |
| `full-episode.json` | `reachableEndings` end-to-end |
| `validation.json` | `validateEpisode` error and warning codes |

---

## Development

```bash
# from repo root
npm run build --workspace @fire-stick/story-graph
npm test  --workspace @fire-stick/story-graph
```
