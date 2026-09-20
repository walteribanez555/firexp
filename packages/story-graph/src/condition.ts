/**
 * Condition AST — the structured representation of a `when` expression.
 *
 * JSON-serialisable so the same AST can be stored in the database and
 * consumed by any language that processes the episode graph (TS dashboard,
 * Kotlin TV app, future server-side evaluation).
 *
 * Grammar:
 *   Cond   = { all: Clause[] }        — all clauses must be true (logical AND)
 *          | { any: Clause[] }        — at least one clause must be true (logical OR)
 *          | Clause                   — a single clause
 *          | "default"                — always true; sentinel for the last variant
 *
 *   Clause = { flag: string, op: Op, value: number }
 *
 *   Op     = "eq" | "ne" | "lt" | "lte" | "gt" | "gte"
 */

export type Op = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';

export interface Clause {
  flag:  string;
  op:    Op;
  value: number;
}

export type Cond =
  | { all: Clause[] }
  | { any: Clause[] }
  | Clause
  | 'default';

// ── op helpers ────────────────────────────────────────────────────────────────

const LEGACY_OP_MAP: Record<string, Op> = {
  '>=': 'gte',
  '<=': 'lte',
  '>':  'gt',
  '<':  'lt',
  '==': 'eq',
  '!=': 'ne',
};

const OP_TO_SYMBOL: Record<Op, string> = {
  gte: '>=',
  lte: '<=',
  gt:  '>',
  lt:  '<',
  eq:  '==',
  ne:  '!=',
};

/**
 * Parse a legacy `when` string (as used in the relay and Kotlin engine) into a
 * structured Cond AST.
 *
 * Supported syntax:
 *   "default"
 *   "flag >= N"
 *   "flag <= N && flag2 > N2"   (only && is supported in legacy strings)
 *
 * Throws if any clause is malformed.
 */
export function parseWhen(expr: string): Cond {
  const trimmed = expr.trim();
  if (trimmed === 'default') return 'default';

  const parts = trimmed.split('&&').map((s) => s.trim());
  const clauses = parts.map((part): Clause => {
    const m = part.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/);
    if (!m) throw new Error(`Invalid condition clause: "${part}" in expression: "${expr}"`);
    const [, flag, rawOp, rawValue] = m;
    const op = LEGACY_OP_MAP[rawOp];
    if (!op) throw new Error(`Unknown operator "${rawOp}" in expression: "${expr}"`);
    return { flag, op, value: Number(rawValue) };
  });

  if (clauses.length === 1) return clauses[0];
  return { all: clauses };
}

/**
 * Serialise a Cond back to a human-readable string.
 *
 * Single-clause Conds produce the same format the legacy strings use, so
 * round-tripping is lossless for the common case.
 * `{ any: [...] }` conditions produce an `||`-joined string (not valid as a
 * legacy `when` value but useful for the dashboard's display layer).
 */
export function whenToString(cond: Cond): string {
  if (cond === 'default') return 'default';

  if ('all' in cond) {
    return cond.all.map(clauseToString).join(' && ');
  }
  if ('any' in cond) {
    return cond.any.map(clauseToString).join(' || ');
  }
  return clauseToString(cond);
}

function clauseToString(c: Clause): string {
  return `${c.flag} ${OP_TO_SYMBOL[c.op]} ${c.value}`;
}
