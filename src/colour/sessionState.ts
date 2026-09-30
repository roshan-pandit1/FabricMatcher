/**
 * sessionState.ts
 * Explicit state machine for FabricMatcher camera session.
 *
 * States:
 *   permissionNeeded → preparingCamera → readyForReference
 *   → collectingReference → referenceReady (live comparison active)
 *   → collectingCandidate → borderline / withinTolerance / outsideTolerance
 *   → invalidCapture (transient; recoverable)
 *   → unsupportedDevice (terminal)
 *   → cameraError (recoverable)
 *   → interrupted
 */

import { LabColour } from './colourMath';
import { BurstResult } from './patchAnalysis';

// ─── State Names ──────────────────────────────────────────────────────────────

export type AppState =
  | 'permissionNeeded'
  | 'permissionDenied'
  | 'preparingCamera'
  | 'readyForReference'
  | 'collectingReference'
  | 'referenceReady'
  | 'collectingCandidate'
  | 'invalidCapture'
  | 'unsupportedDevice'
  | 'cameraError'
  | 'interrupted';

// ─── Camera Contract ──────────────────────────────────────────────────────────

/** Verified camera capability snapshot. Updated by native layer only. */
export interface CameraContract {
  /** True only when AE, AWB locks were requested AND metadata confirmed locked. */
  aeAwbActuallyLocked: boolean;
  /** True only when a single rear lens is confirmed in use. */
  singleRearLensConfirmed: boolean;
  /** True when HDR and scene-mode enhancement are disabled or not available. */
  enhancementsDisabledOrUnavailable: boolean;
  /** Format of frames supplied (informational). */
  pixelFormat: 'yuv420' | 'bgra8888' | 'rgb888' | 'unknown';
  /** Actual sensor orientation degrees [0|90|180|270]. */
  sensorOrientation: 0 | 90 | 180 | 270;
  /** ISO and shutter speed actually used (from metadata, null if unknown). */
  isoActual: number | null;
  shutterActual: number | null;
  /** Controllable capabilities recorded (transparency, not hard requirements). */
  capabilityNotes: string[];
}

export const UNKNOWN_CONTRACT: CameraContract = {
  aeAwbActuallyLocked: false,
  singleRearLensConfirmed: false,
  enhancementsDisabledOrUnavailable: false,
  pixelFormat: 'unknown',
  sensorOrientation: 0,
  isoActual: null,
  shutterActual: null,
  capabilityNotes: [],
};

// ─── Session ──────────────────────────────────────────────────────────────────

/** Unique identifier per camera session (reset on camera restart/error). */
export type SessionId = string;

/** Identifies one "capture event" within a session. */
export type CaptureId = string;

export interface ReferenceCapture {
  sessionId: SessionId;
  captureId: CaptureId;
  timestamp: number;
  burstResult: BurstResult;
  contract: CameraContract;
  /** Frozen lab values; array of 5 frames. */
  frameLab: LabColour[];
  representativeLab: LabColour;
}

// ─── Comparison Result ────────────────────────────────────────────────────────

export type ComparisonStatus =
  | 'within_trial_tolerance'
  | 'outside_trial_tolerance'
  | 'borderline'
  | 'recapture';

export interface ComparisonResult {
  sessionId: SessionId;
  referenceId: CaptureId;
  candidateId: CaptureId;
  timestamp: number;
  status: ComparisonStatus;
  deltaEMedian: number | null;
  deltaEP10: number | null;
  deltaEP90: number | null;
  similarityPercent: number | null;
  similarityP10: number | null;
  similarityP90: number | null;
  /** Candidate Lab minus reference Lab representative. */
  deltaLab: [number, number, number] | null;
  reasons: string[];
  trialTolerance: number;
  /** Not a probability. Not a confidence interval. */
  scoreIsProbability: false;
  spreadIsConfidenceInterval: false;
}

// ─── Saved Match ──────────────────────────────────────────────────────────────

export interface SavedMatch {
  id: string;
  sessionId: SessionId;
  referenceId: CaptureId;
  savedAt: number;
  name: string | null;
  referenceSwatch: string; // hex colour string "#RRGGBB"
  candidateSwatch: string; // hex colour string "#RRGGBB"
  thumbnailUri: string | null;
  comparison: ComparisonResult;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makeSessionId(): SessionId {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeCaptureId(): CaptureId {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeMatchId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Convert a Lab colour to a displayable hex swatch (approximate visual only). */
export function labToHex(lab: LabColour): string {
  // Rough Lab → sRGB via reverse conversion for swatch display
  const [L, a, b] = lab;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const delta = 6 / 29;
  const d3 = delta ** 3;
  const d2 = 3 * delta ** 2;

  const X = (fx ** 3 > d3 ? fx ** 3 : (fx - 4 / 29) * d2) * 0.95047;
  const Y = fy ** 3 > d3 ? fy ** 3 : (fy - 4 / 29) * d2;
  const Z = (fz ** 3 > d3 ? fz ** 3 : (fz - 4 / 29) * d2) * 1.08883;

  // XYZ → linear sRGB
  const rl = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gl = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

  const encode = (u: number) => {
    const c = Math.max(0, Math.min(1, u));
    const e = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(255, e * 255)));
  };

  const r = encode(rl).toString(16).padStart(2, '0');
  const g = encode(gl).toString(16).padStart(2, '0');
  const bh = encode(bl).toString(16).padStart(2, '0');
  return `#${r}${g}${bh}`;
}

/** 'lighter' | 'darker' | null — only when L* difference exceeds deadband. */
export function lighterDarkerLabel(
  deltaL: number,
  deadband = 2.0,
): 'lighter' | 'darker' | null {
  if (Math.abs(deltaL) < deadband) return null;
  return deltaL > 0 ? 'lighter' : 'darker';
}

/** Human-readable status label. */
export function statusLabel(status: ComparisonStatus): string {
  switch (status) {
    case 'within_trial_tolerance': return 'Close match';
    case 'outside_trial_tolerance': return 'Different shade';
    case 'borderline': return 'Borderline';
    case 'recapture': return 'Hold steady';
  }
}
