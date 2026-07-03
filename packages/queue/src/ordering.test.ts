import { describe, it, expect } from 'vitest';

import { orderBySpacing, type OrderableItem } from './ordering';

const item = (id: string, categoryId: string | null): OrderableItem => ({
  id,
  videoId: `vid_${id}`,
  categoryId,
});

describe('orderBySpacing', () => {
  it('returns the input order for 2 or fewer items', () => {
    expect(orderBySpacing([], new Map())).toEqual([]);
    expect(orderBySpacing([item('a', 'x')], new Map())).toEqual(['a']);
    expect(orderBySpacing([item('a', 'x'), item('b', 'x')], new Map())).toEqual(['a', 'b']);
  });

  it('keeps the first item as the anchor', () => {
    const items = [item('a', 'x'), item('b', 'x'), item('c', 'y')];
    expect(orderBySpacing(items, new Map())[0]).toBe('a');
  });

  it('returns a permutation of the input ids (no drops or dupes)', () => {
    const items = [
      item('a', 'x'),
      item('b', 'x'),
      item('c', 'x'),
      item('d', 'y'),
      item('e', 'y'),
    ];
    const out = orderBySpacing(items, new Map());
    expect([...out].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('spaces same-category items apart using category fallback', () => {
    // Three "x" and one "y": greedy should insert the "y" between x's rather
    // than leaving all three x's adjacent.
    const items = [item('a', 'x'), item('b', 'x'), item('c', 'x'), item('d', 'y')];
    const out = orderBySpacing(items, new Map());
    // After anchor 'a' (x), the least-similar next item is 'd' (y).
    expect(out[0]).toBe('a');
    expect(out[1]).toBe('d');
  });

  it('prefers embedding similarity when embeddings are present', () => {
    // a and b point the same way; c is orthogonal. After anchor a, c is least
    // similar and should be placed before b.
    const emb = new Map<string, number[]>([
      ['vid_a', [1, 0]],
      ['vid_b', [1, 0]],
      ['vid_c', [0, 1]],
    ]);
    const items = [item('a', null), item('b', null), item('c', null)];
    const out = orderBySpacing(items, emb);
    expect(out).toEqual(['a', 'c', 'b']);
  });
});
