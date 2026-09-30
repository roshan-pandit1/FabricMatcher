/**
 * compareBursts.test.ts
 * Tests for the top-level compare_bursts function.
 */

import { analysePatch, analyseBurst } from '../colour/patchAnalysis';
import { compareBursts } from '../colour/compareBursts';
import { similarityIndex } from '../colour/colourMath';

function solidPatch(r: number, g: number, b: number, w = 64, h = 64): Uint8Array {
  const buf = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    buf[i * 3] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
  return buf;
}

function makeBurst(r: number, g: number, b: number, count = 5) {
  const patch = solidPatch(r, g, b);
  const patchResults = Array.from({ length: count }, () => analysePatch(patch, 64, 64));
  return analyseBurst(patchResults);
}

const GATES = { captureConditionsVerified: true, focusAndMotionOk: true };

describe('compareBursts — gate enforcement', () => {
  test('no gates → recapture with no score', () => {
    const burst = makeBurst(64, 102, 153);
    const result = compareBursts({
      referenceResult: burst,
      candidateResult: burst,
      captureConditionsVerified: false,
      focusAndMotionOk: false,
    });
    expect(result.status).toBe('recapture');
    expect(result.similarityPercent).toBeNull();
    expect(result.deltaEMedian).toBeNull();
  });

  test('focusAndMotionOk=false → recapture', () => {
    const burst = makeBurst(64, 102, 153);
    const result = compareBursts({
      referenceResult: burst,
      candidateResult: burst,
      captureConditionsVerified: true,
      focusAndMotionOk: false,
    });
    expect(result.status).toBe('recapture');
  });
});

describe('compareBursts — identical fabric', () => {
  test('same colour burst → within_trial_tolerance with 100% similarity', () => {
    const burst = makeBurst(64, 102, 153);
    const result = compareBursts({
      referenceResult: burst,
      candidateResult: burst,
      ...GATES,
    });
    expect(result.status).toBe('within_trial_tolerance');
    expect(result.similarityPercent).toBe(100);
    expect(result.deltaEMedian).toBeLessThan(0.001);
  });
});

describe('compareBursts — different colour', () => {
  test('clearly different colours → outside_trial_tolerance', () => {
    const ref = makeBurst(64, 102, 153);   // blue
    const cand = makeBurst(200, 80, 40);   // orange
    const result = compareBursts({
      referenceResult: ref,
      candidateResult: cand,
      ...GATES,
    });
    expect(result.status).toBe('outside_trial_tolerance');
    expect(result.similarityPercent).toBeLessThan(50);
  });
});

describe('compareBursts — invalid reference or candidate', () => {
  test('failed reference burst → recapture', () => {
    const badBurst = { ok: false, reasons: ['collect_more_frames' as const] };
    const goodBurst = makeBurst(64, 102, 153);
    const result = compareBursts({
      referenceResult: badBurst,
      candidateResult: goodBurst,
      ...GATES,
    });
    expect(result.status).toBe('recapture');
    expect(result.similarityPercent).toBeNull();
  });

  test('clipped candidate → recapture', () => {
    const ref = makeBurst(64, 102, 153);
    const clippedPatch = solidPatch(255, 255, 255);
    const clippedResults = Array.from({ length: 5 }, () => analysePatch(clippedPatch, 64, 64));
    const clippedBurst = analyseBurst(clippedResults);
    const result = compareBursts({
      referenceResult: ref,
      candidateResult: clippedBurst,
      ...GATES,
    });
    expect(result.status).toBe('recapture');
    expect(result.similarityPercent).toBeNull();
  });
});

describe('compareBursts — score properties', () => {
  test('metadata flags', () => {
    const burst = makeBurst(64, 102, 153);
    const result = compareBursts({
      referenceResult: burst,
      candidateResult: burst,
      ...GATES,
    });
    expect(result.scoreIsProbability).toBe(false);
    expect(result.spreadIsConfidenceInterval).toBe(false);
  });

  test('similarity_percent matches manually computed index', () => {
    const burst = makeBurst(64, 102, 153);
    const result = compareBursts({
      referenceResult: burst,
      candidateResult: burst,
      ...GATES,
    });
    if (result.deltaEMedian !== null && result.similarityPercent !== null) {
      const expected = similarityIndex(result.deltaEMedian, 10);
      expect(Math.abs(result.similarityPercent - expected)).toBeLessThan(0.1);
    }
  });
});

describe('compareBursts — acceptance decision rules', () => {
  test('D90 <= tau produces within_trial_tolerance', () => {
    const burst = makeBurst(64, 102, 153);
    const result = compareBursts({ referenceResult: burst, candidateResult: burst, ...GATES });
    // For identical bursts D90 ≈ 0 << tau=3.0
    expect(result.status).toBe('within_trial_tolerance');
    expect(result.deltaEP90!).toBeLessThanOrEqual(3.0);
  });
});
