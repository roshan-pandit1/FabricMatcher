/**
 * compareBursts.ts
 * Top-level comparison of reference and candidate bursts.
 * Port of fabric_colour_matcher.py: compare_bursts.
 */

import { deltaE2000, similarityIndex, quantile, LabColour } from './colourMath';
import { BurstResult, Config, DEFAULT_CONFIG } from './patchAnalysis';
import { ComparisonResult, makeSessionId, makeCaptureId } from './sessionState';

export interface CompareBurstsInput {
  referenceResult: BurstResult;
  candidateResult: BurstResult;
  /** Only true when the camera integration has verified same-session locks. */
  captureConditionsVerified: boolean;
  /** Only true when focus and motion checks are satisfied. */
  focusAndMotionOk: boolean;
  sessionId?: string;
  referenceId?: string;
  candidateId?: string;
  config?: Config;
}

export function compareBursts(input: CompareBurstsInput): ComparisonResult {
  const cfg = input.config ?? DEFAULT_CONFIG;
  const sessionId = input.sessionId ?? makeSessionId();
  const referenceId = input.referenceId ?? makeCaptureId();
  const candidateId = input.candidateId ?? makeCaptureId();
  const timestamp = Date.now();

  const base: Omit<ComparisonResult, 'status' | 'deltaEMedian' | 'deltaEP10' | 'deltaEP90' |
    'similarityPercent' | 'similarityP10' | 'similarityP90' | 'deltaLab' | 'reasons'> = {
    sessionId,
    referenceId,
    candidateId,
    timestamp,
    trialTolerance: cfg.acceptanceDeltaE,
    scoreIsProbability: false,
    spreadIsConfidenceInterval: false,
  };

  const externalReasons: string[] = [];
  if (!input.captureConditionsVerified) {
    externalReasons.push('verify_same_session_lens_settings_processing_and_light');
  }
  if (!input.focusAndMotionOk) {
    externalReasons.push('wait_for_focus_and_stable_fabric_tracking');
  }
  if (externalReasons.length > 0) {
    return {
      ...base,
      status: 'recapture',
      deltaEMedian: null,
      deltaEP10: null,
      deltaEP90: null,
      similarityPercent: null,
      similarityP10: null,
      similarityP90: null,
      deltaLab: null,
      reasons: externalReasons,
    };
  }

  const { referenceResult, candidateResult } = input;

  if (!referenceResult.ok || !candidateResult.ok) {
    return {
      ...base,
      status: 'recapture',
      deltaEMedian: null,
      deltaEP10: null,
      deltaEP90: null,
      similarityPercent: null,
      similarityP10: null,
      similarityP90: null,
      deltaLab: null,
      reasons: [
        ...(!referenceResult.ok ? referenceResult.reasons : []).map(r => `reference:${r}`),
        ...(!candidateResult.ok ? candidateResult.reasons : []).map(r => `candidate:${r}`),
      ],
    };
  }

  const refFrames = referenceResult.frameLab as LabColour[];
  const canFrames = candidateResult.frameLab as LabColour[];

  // Compute all 25 pairwise CIEDE2000 distances (5×5)
  const distances: number[] = [];
  for (const r of refFrames) {
    for (const c of canFrames) {
      distances.push(deltaE2000(r, c));
    }
  }

  const q10 = quantile(distances, 0.1);
  const median = quantile(distances, 0.5);
  const q90 = quantile(distances, 0.9);

  let status: ComparisonResult['status'];
  if (q90 <= cfg.acceptanceDeltaE) {
    status = 'within_trial_tolerance';
  } else if (q10 > cfg.acceptanceDeltaE) {
    status = 'outside_trial_tolerance';
  } else {
    status = 'borderline';
  }

  const refLab = referenceResult.representativeLab as LabColour;
  const canLab = candidateResult.representativeLab as LabColour;
  const deltaLab: [number, number, number] = [
    canLab[0] - refLab[0],
    canLab[1] - refLab[1],
    canLab[2] - refLab[2],
  ];

  return {
    ...base,
    status,
    deltaEMedian: median,
    deltaEP10: q10,
    deltaEP90: q90,
    similarityPercent: Math.round(similarityIndex(median, cfg.d50) * 10) / 10,
    // Note: index is monotone decreasing so p10 of similarity corresponds to q90 of distance
    similarityP10: Math.round(similarityIndex(q90, cfg.d50) * 10) / 10,
    similarityP90: Math.round(similarityIndex(q10, cfg.d50) * 10) / 10,
    deltaLab,
    reasons: [],
  };
}
