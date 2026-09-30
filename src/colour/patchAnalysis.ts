/**
 * patchAnalysis.ts
 * Spatial (per-frame) patch quality analysis.
 * Port of fabric_colour_matcher.py: analyse_patch + _analyse_burst.
 *
 * All pixel data arrives as encoded sRGB in [0,1] — already converted from
 * whatever format the camera produced. No colour normalisation is done here.
 */

import {
  srgbToLab,
  deltaE2000,
  componentwiseMedian,
  quantile,
  LabColour,
} from './colourMath';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface Config {
  /** Number of grid rows/columns (4 → 16 tiles). */
  grid: number;
  /** Minimum usable frames per burst. */
  minFrames: number;
  /** Minimum usable pixels per tile. */
  minPixelsPerTile: number;
  /** Minimum fraction of usable pixels within a tile for the tile to count. */
  minUsableTileFraction: number;
  /** Minimum fraction of tiles that must be usable. */
  minGoodTileFraction: number;
  /** Clipping margin per channel (1/255 ≈ 0.00392). */
  channelMargin: number;
  /** Maximum allowed fraction of channel-clipped pixels in a patch. */
  maxClippedFraction: number;
  /** Maximum allowed 90th-percentile spatial spread (CIEDE2000). */
  maxSpatialP90: number;
  /** Maximum allowed 90th-percentile temporal spread across burst frames. */
  maxTemporalP90: number;
  /** Trial acceptance tolerance tau (D90 <= tau → within tolerance). */
  acceptanceDeltaE: number;
  /** Half-similarity distance for display index. */
  d50: number;
}

export const DEFAULT_CONFIG: Readonly<Config> = {
  grid: 4,
  minFrames: 5,
  minPixelsPerTile: 16,
  minUsableTileFraction: 0.80,
  minGoodTileFraction: 0.75,
  channelMargin: 1 / 255,
  maxClippedFraction: 0.10,
  maxSpatialP90: 3.0,
  maxTemporalP90: 1.0,
  acceptanceDeltaE: 3.0,
  d50: 10.0,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type PatchRejectReason =
  | 'too_many_channel_clipped_pixels'
  | 'too_few_usable_tiles'
  | 'patch_not_uniform_choose_a_flat_plain_area';

export interface PatchResult {
  ok: boolean;
  reasons: PatchRejectReason[];
  lab: LabColour | null;
  clippedFraction: number;
  spatialP90: number | null;
  usableTiles?: number;
}

export type BurstRejectReason =
  | 'collect_more_frames'
  | 'unstable_colour_over_time'
  | PatchRejectReason;

export interface BurstResult {
  ok: boolean;
  reasons: BurstRejectReason[];
  frameLab?: LabColour[];
  representativeLab?: LabColour;
  temporalP90?: number;
  spatialP90Max?: number;
}

// ─── Patch Analysis ───────────────────────────────────────────────────────────

/**
 * Pixel data is a flat Uint8Array or Float32Array for a W×H RGB patch
 * (row-major, 3 channels, no alpha).
 *
 * For Uint8Array: values 0–255 encoded sRGB.
 * For Float32Array: values 0–1 encoded sRGB.
 *
 * width and height describe the actual pixel dimensions of this array.
 */
export function analysePatch(
  pixels: Uint8Array | Float32Array,
  width: number,
  height: number,
  config: Config = DEFAULT_CONFIG,
): PatchResult {
  const cfg = config;
  const totalPixels = width * height;
  if (totalPixels === 0 || width < cfg.grid || height < cfg.grid) {
    return {
      ok: false,
      reasons: ['too_few_usable_tiles'],
      lab: null,
      clippedFraction: 1,
      spatialP90: null,
    };
  }

  const isUint8 = pixels instanceof Uint8Array;
  const margin = cfg.channelMargin;

  // Build per-pixel usable mask and convert to Lab
  const usableMask = new Uint8Array(totalPixels);
  const labPixels: LabColour[] = new Array(totalPixels);
  let clippedCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const base = i * 3;
    const r = isUint8 ? (pixels[base] as number) / 255 : (pixels[base] as number);
    const g = isUint8 ? (pixels[base + 1] as number) / 255 : (pixels[base + 1] as number);
    const b = isUint8 ? (pixels[base + 2] as number) / 255 : (pixels[base + 2] as number);

    const isClipped =
      r <= margin || r >= 1 - margin ||
      g <= margin || g >= 1 - margin ||
      b <= margin || b >= 1 - margin;

    if (isClipped) {
      clippedCount++;
      usableMask[i] = 0;
    } else {
      usableMask[i] = 1;
      labPixels[i] = srgbToLab(r, g, b);
    }
  }

  const clippedFraction = clippedCount / totalPixels;
  const reasons: PatchRejectReason[] = [];

  if (clippedFraction > cfg.maxClippedFraction) {
    reasons.push('too_many_channel_clipped_pixels');
  }

  // Tile analysis
  const tileLabs: LabColour[] = [];
  const tileCount = cfg.grid * cfg.grid;
  const minGoodTiles = Math.ceil(tileCount * cfg.minGoodTileFraction);

  for (let row = 0; row < cfg.grid; row++) {
    for (let col = 0; col < cfg.grid; col++) {
      const y0 = Math.floor((row * height) / cfg.grid);
      const y1 = Math.floor(((row + 1) * height) / cfg.grid);
      const x0 = Math.floor((col * width) / cfg.grid);
      const x1 = Math.floor(((col + 1) * width) / cfg.grid);

      const tileLab: LabColour[] = [];
      let tileTotal = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = y * width + x;
          tileTotal++;
          if (usableMask[idx]) {
            tileLab.push(labPixels[idx]);
          }
        }
      }

      const usableFraction = tileTotal > 0 ? tileLab.length / tileTotal : 0;
      if (
        tileLab.length >= cfg.minPixelsPerTile &&
        usableFraction >= cfg.minUsableTileFraction
      ) {
        tileLabs.push(componentwiseMedian(tileLab));
      }
    }
  }

  if (tileLabs.length < minGoodTiles) {
    reasons.push('too_few_usable_tiles');
  }

  if (tileLabs.length === 0) {
    return {
      ok: false,
      reasons,
      lab: null,
      clippedFraction,
      spatialP90: null,
    };
  }

  // Representative frame colour = componentwise median of tile medians
  const centre = componentwiseMedian(tileLabs);

  // Spatial uniformity: 90th percentile of per-pixel CIEDE2000 to centre
  const usableLabList: LabColour[] = [];
  for (let i = 0; i < totalPixels; i++) {
    if (usableMask[i]) usableLabList.push(labPixels[i]);
  }
  const distances = usableLabList.map(px => deltaE2000(px, centre));
  const spatialP90 = quantile(distances, 0.9);

  if (spatialP90 > cfg.maxSpatialP90) {
    reasons.push('patch_not_uniform_choose_a_flat_plain_area');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    lab: centre,
    clippedFraction,
    spatialP90,
    usableTiles: tileLabs.length,
  };
}

// ─── Burst Analysis ───────────────────────────────────────────────────────────

/**
 * Analyse a burst of frames that have already been individually analysed.
 * Accepts pre-computed PatchResults to avoid re-processing.
 */
export function analyseBurst(
  patchResults: PatchResult[],
  config: Config = DEFAULT_CONFIG,
): BurstResult {
  const cfg = config;

  if (patchResults.length < cfg.minFrames) {
    return { ok: false, reasons: ['collect_more_frames'] };
  }

  const allReasons = new Set<BurstRejectReason>();
  patchResults.forEach(r => r.reasons.forEach(reason => allReasons.add(reason)));

  if (allReasons.size > 0) {
    return { ok: false, reasons: Array.from(allReasons) };
  }

  const frameLab = patchResults.map(r => r.lab as LabColour);
  const middle = componentwiseMedian(frameLab);
  const temporalDistances = frameLab.map(lab => deltaE2000(lab, middle));
  const temporalP90 = quantile(temporalDistances, 0.9);

  if (temporalP90 > cfg.maxTemporalP90) {
    return {
      ok: false,
      reasons: ['unstable_colour_over_time'],
      temporalP90,
    };
  }

  const spatialP90Max = Math.max(
    ...patchResults.map(r => r.spatialP90 ?? 0),
  );

  return {
    ok: true,
    reasons: [],
    frameLab,
    representativeLab: middle,
    temporalP90,
    spatialP90Max,
  };
}
