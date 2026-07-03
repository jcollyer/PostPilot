import { describe, it, expect } from 'vitest';

import { cosineSimilarity } from './embeddings';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it('returns 1 for parallel vectors regardless of magnitude', () => {
    expect(cosineSimilarity([1, 0], [5, 0])).toBeCloseTo(1, 10);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 10);
  });

  it('returns 0 when either vector is all zeros (avoids divide-by-zero)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
  });

  it('compares only the overlapping prefix when lengths differ', () => {
    // Extra trailing dimension on b is ignored; prefix [1,0] vs [1,0] -> 1.
    expect(cosineSimilarity([1, 0], [1, 0, 99])).toBeCloseTo(1, 10);
  });
});
