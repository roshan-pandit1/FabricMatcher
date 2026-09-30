/**
 * colourMath.ts
 * CIEDE2000 colour difference calculation and sRGB to CIE L*a*b* conversion.
 *
 * Implements the Sharma, Wu & Dalal (2005) CIEDE2000 algorithm and standard D65/2° sRGB.
 */

export type LabColour = [number, number, number];

/**
 * Convert encoded sRGB channel values in [0, 1] to CIE L*a*b* (D65 / 2° observer).
 */
export function srgbToLab(r: number, g: number, b: number): LabColour {
  const decode = (c: number): number => {
    const clamped = Math.max(0, Math.min(1, isNaN(c) ? 0 : c));
    return clamped <= 0.04045
      ? clamped / 12.92
      : Math.pow((clamped + 0.055) / 1.055, 2.4);
  };

  const lr = decode(r);
  const lg = decode(g);
  const lb = decode(b);

  // Linear RGB -> XYZ (D65 reference white)
  const X = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const Y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
  const Z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;

  // D65 reference white
  const Xn = 0.95047;
  const Yn = 1.00000;
  const Zn = 1.08883;

  const xr = X / Xn;
  const yr = Y / Yn;
  const zr = Z / Zn;

  const epsilon = 216 / 24389; // (6/29)^3 ≈ 0.008856
  const kappa = 24389 / 27;    // (29/3)^3 ≈ 903.3

  const f = (t: number): number => {
    return t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116;
  };

  const fx = f(xr);
  const fy = f(yr);
  const fz = f(zr);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const labB = 200 * (fy - fz);

  return [L, a, labB];
}

/**
 * Calculate CIEDE2000 colour difference ΔE₀₀ between two CIE L*a*b* colours.
 * Parametric factors kL = kC = kH = 1.
 */
export function deltaE2000(lab1: LabColour, lab2: LabColour): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const rad2deg = 180 / Math.PI;
  const deg2rad = Math.PI / 180;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1prime = (1 + G) * a1;
  const a2prime = (1 + G) * a2;

  const C1prime = Math.hypot(a1prime, b1);
  const C2prime = Math.hypot(a2prime, b2);

  const getHprime = (a: number, b: number): number => {
    if (a === 0 && b === 0) return 0;
    let deg = Math.atan2(b, a) * rad2deg;
    if (deg < 0) deg += 360;
    return deg;
  };

  const h1prime = getHprime(a1prime, b1);
  const h2prime = getHprime(a2prime, b2);

  const deltaLprime = L2 - L1;
  const deltaCprime = C2prime - C1prime;

  let deltahprime = 0;
  if (C1prime * C2prime !== 0) {
    const diff = h2prime - h1prime;
    if (Math.abs(diff) <= 180) {
      deltahprime = diff;
    } else if (diff > 180) {
      deltahprime = diff - 360;
    } else {
      deltahprime = diff + 360;
    }
  }

  const deltaHprime = 2 * Math.sqrt(C1prime * C2prime) * Math.sin((deltahprime / 2) * deg2rad);

  const Lbarprime = (L1 + L2) / 2;
  const Cbarprime = (C1prime + C2prime) / 2;

  let hbarprime = 0;
  if (C1prime * C2prime !== 0) {
    const absDiff = Math.abs(h1prime - h2prime);
    const sum = h1prime + h2prime;
    if (absDiff <= 180) {
      hbarprime = sum / 2;
    } else if (sum < 360) {
      hbarprime = (sum + 360) / 2;
    } else {
      hbarprime = (sum - 360) / 2;
    }
  }

  const T = 1 -
    0.17 * Math.cos((hbarprime - 30) * deg2rad) +
    0.24 * Math.cos((2 * hbarprime) * deg2rad) +
    0.32 * Math.cos((3 * hbarprime + 6) * deg2rad) -
    0.20 * Math.cos((4 * hbarprime - 63) * deg2rad);

  const deltaTheta = 30 * Math.exp(-Math.pow((hbarprime - 275) / 25, 2));

  const Cbarprime7 = Math.pow(Cbarprime, 7);
  const RC = 2 * Math.sqrt(Cbarprime7 / (Cbarprime7 + Math.pow(25, 7)));

  const LbarMinus50Sq = Math.pow(Lbarprime - 50, 2);
  const SL = 1 + (0.015 * LbarMinus50Sq) / Math.sqrt(20 + LbarMinus50Sq);
  const SC = 1 + 0.045 * Cbarprime;
  const SH = 1 + 0.015 * Cbarprime * T;

  const RT = -Math.sin(2 * deltaTheta * deg2rad) * RC;

  const dL = deltaLprime / SL;
  const dC = deltaCprime / SC;
  const dH = deltaHprime / SH;

  const res = Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
  return isNaN(res) ? 0 : res;
}

/**
 * Monotonically decreasing similarity index S in [0, 100].
 * S = 100 * exp(-ln(2) * (deltaE / d50)^2)
 */
export function similarityIndex(deltaE: number, d50: number): number {
  if (deltaE < 0) throw new Error('Distance cannot be negative');
  if (d50 <= 0) throw new Error('d50 must be positive');
  return 100 * Math.exp(-Math.LN2 * Math.pow(deltaE / d50, 2));
}

/**
 * Calculate quantile q in [0, 1] of an array with linear interpolation.
 */
export function quantile(arr: number[], q: number): number {
  if (arr.length === 0) throw new Error('Array cannot be empty');
  if (q < 0 || q > 1) throw new Error('Quantile must be in [0, 1]');

  const sorted = [...arr].sort((x, y) => x - y);
  if (q === 0) return sorted[0];
  if (q === 1) return sorted[sorted.length - 1];

  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Compute componentwise median of an array of CIE L*a*b* colours.
 */
export function componentwiseMedian(labs: LabColour[]): LabColour {
  if (labs.length === 0) throw new Error('Labs array cannot be empty');
  const Ls = labs.map(l => l[0]);
  const as = labs.map(l => l[1]);
  const bs = labs.map(l => l[2]);
  return [
    quantile(Ls, 0.5),
    quantile(as, 0.5),
    quantile(bs, 0.5),
  ];
}
