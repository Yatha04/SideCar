import { UnderstandingLevel } from './ContextAssembler';

const LEVEL_ORDER: UnderstandingLevel[] = ['developer', 'architecture', 'syntax'];

export function nextLevel(current: UnderstandingLevel): UnderstandingLevel {
  const idx = LEVEL_ORDER.indexOf(current);
  return LEVEL_ORDER[(idx + 1) % LEVEL_ORDER.length];
}

export function isValidLevel(value: unknown): value is UnderstandingLevel {
  return value === 'developer' || value === 'architecture' || value === 'syntax';
}
