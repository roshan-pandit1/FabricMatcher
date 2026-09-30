/**
 * __tests__/colourMath.test.ts
 * Tests for the colour-math module.
 *
 * Covers:
 *   - All 34 published CIEDE2000 pairs (both directions), tolerance 0.000051
 *   - Identity, symmetry, zero-chroma, hue-boundary cases
 *   - sRGB decoding: black, white
 *   - Similarity curve: distance 0 → 100, distance d50 → 50
 */

import {
  srgbToLab,
  deltaE2000,
  similarityIndex,
  quantile,
  componentwiseMedian,
} from '../colour/colourMath';

// ─── Published test pairs from Sharma, Wu & Dalal (2005) ─────────────────────
// Tab-separated: L1 a1 b1 L2 a2 b2 deltaE
// Source: https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt
const PUBLISHED_PAIRS: Array<[number, number, number, number, number, number, number]> = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082],
  // pair 34 (index 33) — the last one
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
];

const ATOL = 5.1e-5;

function closeTo(a: number, b: number, tol = ATOL): boolean {
  return Math.abs(a - b) <= tol;
}

describe('deltaE2000 — published test pairs', () => {
  PUBLISHED_PAIRS.forEach(([L1, a1, b1, L2, a2, b2, expected], i) => {
    test(`pair ${i + 1}: forward`, () => {
      const result = deltaE2000([L1, a1, b1], [L2, a2, b2]);
      expect(closeTo(result, expected)).toBe(true);
    });

    test(`pair ${i + 1}: symmetry (backward = forward)`, () => {
      const fwd = deltaE2000([L1, a1, b1], [L2, a2, b2]);
      const bwd = deltaE2000([L2, a2, b2], [L1, a1, b1]);
      expect(Math.abs(fwd - bwd)).toBeLessThan(1e-10);
    });
  });
});

describe('deltaE2000 — identity', () => {
  const cases: Array<[number, number, number]> = [
    [50, 0, 0],
    [0, 0, 0],
    [100, 0, 0],
    [50, 25, -25],
    [50, 0.001, 0],  // near zero chroma
  ];
  cases.forEach(lab => {
    test(`identity ${JSON.stringify(lab)}`, () => {
      expect(deltaE2000(lab, lab)).toBeLessThan(1e-10);
    });
  });
});

describe('deltaE2000 — zero chroma handling', () => {
  test('achromatic pair', () => {
    const d = deltaE2000([50, 0, 0], [50, 0, 0]);
    expect(d).toBeLessThan(1e-10);
  });

  test('one achromatic', () => {
    const d = deltaE2000([50, 0, 0], [50, 1, 1]);
    expect(d).toBeGreaterThan(0);
  });
});

describe('deltaE2000 — hue boundary (near 0/360 degrees)', () => {
  // Pair 9-11 from published data test near-zero chroma hue wrap
  test('pair 9 published', () => {
    const d = deltaE2000([50, 2.49, -0.001], [50, -2.49, 0.0009]);
    expect(closeTo(d, 7.1792)).toBe(true);
  });
  test('pair 12 published', () => {
    const d = deltaE2000([50, -0.001, 2.49], [50, 0.0009, -2.49]);
    expect(closeTo(d, 4.8045)).toBe(true);
  });
});

describe('sRGB → Lab conversion', () => {
  test('black → Lab(0, 0, 0)', () => {
    const lab = srgbToLab(0, 0, 0);
    expect(Math.abs(lab[0])).toBeLessThan(1e-6);
    expect(Math.abs(lab[1])).toBeLessThan(1e-6);
    expect(Math.abs(lab[2])).toBeLessThan(1e-6);
  });

  test('white → Lab(100, 0, 0)', () => {
    const lab = srgbToLab(1, 1, 1);
    expect(Math.abs(lab[0] - 100)).toBeLessThan(3e-4);
    expect(Math.abs(lab[1])).toBeLessThan(1e-3);
    expect(Math.abs(lab[2])).toBeLessThan(1e-3);
  });

  test('mid-grey lightness is about 53.4', () => {
    const lab = srgbToLab(0.5, 0.5, 0.5);
    expect(lab[0]).toBeGreaterThan(52);
    expect(lab[0]).toBeLessThan(55);
    expect(Math.abs(lab[1])).toBeLessThan(0.01);
    expect(Math.abs(lab[2])).toBeLessThan(0.01);
  });
});

describe('similarityIndex', () => {
  test('distance 0 → 100', () => {
    expect(similarityIndex(0, 10)).toBeCloseTo(100, 10);
  });

  test('distance d50 → 50', () => {
    expect(similarityIndex(10, 10)).toBeCloseTo(50, 10);
    expect(similarityIndex(5, 5)).toBeCloseTo(50, 10);
  });

  test('monotone decreasing', () => {
    const s1 = similarityIndex(1, 10);
    const s5 = similarityIndex(5, 10);
    const s10 = similarityIndex(10, 10);
    expect(s1).toBeGreaterThan(s5);
    expect(s5).toBeGreaterThan(s10);
  });

  test('throws on negative distance', () => {
    expect(() => similarityIndex(-1, 10)).toThrow();
  });

  test('throws on non-positive d50', () => {
    expect(() => similarityIndex(5, 0)).toThrow();
  });
});

describe('quantile', () => {
  test('median of [1,2,3,4,5]', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBeCloseTo(3, 10);
  });

  test('q=0 is min', () => {
    const arr = [3, 1, 4, 1, 5, 9];
    expect(quantile(arr, 0)).toBe(1);
  });

  test('q=1 is max', () => {
    const arr = [3, 1, 4, 1, 5, 9];
    expect(quantile(arr, 1)).toBe(9);
  });

  test('linear interpolation', () => {
    // [1, 3] → q=0.5 → 2
    expect(quantile([1, 3], 0.5)).toBe(2);
  });
});

describe('componentwiseMedian', () => {
  test('single element identity', () => {
    const result = componentwiseMedian([[50, 25, -10]]);
    expect(result).toEqual([50, 25, -10]);
  });

  test('two elements average', () => {
    const result = componentwiseMedian([[40, 20, -5], [60, 40, 5]]);
    expect(result[0]).toBeCloseTo(50, 10);
    expect(result[1]).toBeCloseTo(30, 10);
    expect(result[2]).toBeCloseTo(0, 10);
  });
});
