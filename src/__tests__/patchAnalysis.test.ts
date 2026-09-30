/**
 * patchAnalysis.test.ts
 * Tests for patch spatial analysis and burst temporal stability.
 */

import { analysePatch, analyseBurst, DEFAULT_CONFIG, Config } from '../colour/patchAnalysis';
import { LabColour } from '../colour/colourMath';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a flat 64×64 RGB patch in uint8. */
function solidPatch(r: number, g: number, b: number, w = 64, h = 64): Uint8Array {
  const buf = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    buf[i * 3] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
  return buf;
}

/** Create a patch that is half one colour and half another (column split). */
function splitPatch(r1: number, g1: number, b1: number,
                   r2: number, g2: number, b2: number,
                   w = 64, h = 64): Uint8Array {
  const buf = new Uint8Array(w * h * 3);
  const half = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (x < half) {
        buf[i] = r1; buf[i + 1] = g1; buf[i + 2] = b1;
      } else {
        buf[i] = r2; buf[i + 1] = g2; buf[i + 2] = b2;
      }
    }
  }
  return buf;
}

// ─── analysePatch ─────────────────────────────────────────────────────────────

describe('analysePatch — valid uniform patch', () => {
  test('mid-blue solid patch passes', () => {
    const patch = solidPatch(64, 102, 153);
    const result = analysePatch(patch, 64, 64);
    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.lab).not.toBeNull();
    expect(result.clippedFraction).toBeLessThan(0.1);
    expect(result.spatialP90).not.toBeNull();
  });

  test('Lab output is plausible range for mid-blue', () => {
    const patch = solidPatch(64, 102, 153);
    const result = analysePatch(patch, 64, 64);
    expect(result.lab![0]).toBeGreaterThan(30);
    expect(result.lab![0]).toBeLessThan(60);
  });
});

describe('analysePatch — channel clipping', () => {
  test('pure white (255,255,255) is rejected', () => {
    const patch = solidPatch(255, 255, 255);
    const result = analysePatch(patch, 64, 64);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('too_many_channel_clipped_pixels');
  });

  test('pure black (0,0,0) is rejected', () => {
    const patch = solidPatch(0, 0, 0);
    const result = analysePatch(patch, 64, 64);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('too_many_channel_clipped_pixels');
  });

  test('single channel at max clipped is rejected', () => {
    const patch = solidPatch(255, 100, 100);
    const result = analysePatch(patch, 64, 64);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('too_many_channel_clipped_pixels');
  });
});

describe('analysePatch — non-uniform / mixed colour', () => {
  test('half blue half orange is rejected for uniformity', () => {
    const patch = splitPatch(64, 102, 153, 200, 120, 40);
    const result = analysePatch(patch, 64, 64);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('patch_not_uniform_choose_a_flat_plain_area');
  });
});

describe('analysePatch — small patch', () => {
  test('patch smaller than grid is rejected', () => {
    const patch = solidPatch(100, 150, 100, 2, 2);
    const result = analysePatch(patch, 2, 2);
    expect(result.ok).toBe(false);
  });
});

// ─── analyseBurst ─────────────────────────────────────────────────────────────

describe('analyseBurst — valid stable burst', () => {
  test('5 identical valid patches pass', () => {
    const patch = solidPatch(64, 102, 153);
    const patchResults = Array.from({ length: 5 }, () => analysePatch(patch, 64, 64));
    const result = analyseBurst(patchResults);
    expect(result.ok).toBe(true);
    expect(result.temporalP90).toBeDefined();
    expect(result.temporalP90!).toBeLessThan(DEFAULT_CONFIG.maxTemporalP90);
    expect(result.frameLab).toHaveLength(5);
  });
});

describe('analyseBurst — insufficient frames', () => {
  test('fewer than minFrames returns recapture', () => {
    const patch = solidPatch(64, 102, 153);
    const patchResults = [analysePatch(patch, 64, 64)];
    const result = analyseBurst(patchResults);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('collect_more_frames');
  });
});

describe('analyseBurst — temporal instability', () => {
  test('alternating colours are unstable', () => {
    const blue = solidPatch(64, 102, 153);
    const orange = solidPatch(200, 120, 40);
    const patchResults = [
      analysePatch(blue, 64, 64),
      analysePatch(orange, 64, 64),
      analysePatch(blue, 64, 64),
      analysePatch(orange, 64, 64),
      analysePatch(blue, 64, 64),
    ];
    // Note: orange patch may fail spatial check; if so burst fails for that reason
    const result = analyseBurst(patchResults);
    expect(result.ok).toBe(false);
  });
});

describe('analyseBurst — invalid frames propagate', () => {
  test('burst with one clipped frame is rejected', () => {
    const good = solidPatch(64, 102, 153);
    const bad = solidPatch(255, 255, 255);
    const patchResults = [
      analysePatch(good, 64, 64),
      analysePatch(good, 64, 64),
      analysePatch(bad, 64, 64),
      analysePatch(good, 64, 64),
      analysePatch(good, 64, 64),
    ];
    const result = analyseBurst(patchResults);
    expect(result.ok).toBe(false);
  });
});
