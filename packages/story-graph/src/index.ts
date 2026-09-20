// Condition AST
export type { Op, Clause, Cond } from './condition.js';
export { parseWhen, whenToString } from './condition.js';

// Engine functions
export {
  evaluateWhen,
  applySet,
  selectVariant,
  resolveVotes,
  findShadowedVariants,
  findInconsequentialDecisions,
  reachableEndings,
} from './engine.js';

// Validation
export type { IssueSeverity, ValidationIssue, ValidationResult } from './validation.js';
export {
  GraphSchema,
  StoryGraphSchema,
  StoryChapterSchema,
  StoryVariantSchema,
  ChapterDecisionSchema,
  DecisionOptionSchema,
  validateEpisode,
} from './validation.js';
