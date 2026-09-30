/**
 * __tests__/frameConversion.test.ts
 * Tests for frameConversion ROI extraction and coordinate mapping.
 */

import { extractRoiRgb, mapPreviewRoiToFrame } from '../camera/frameConversion';

describe('extractRoiRgb — RGB888 format', () => {
  test('extract 2x2 ROI from 4x4 RGB frame', () => {
    const frameW = 4;
    const frameH = 4;
    const buffer = new Uint8Array(frameW * frameH * 3);

    // Fill buffer with distinct RGB values
    for (let y = 0; y < frameH; y++) {
      for (let x = 0; x < frameW; x++) {
        const idx = (y * frameW + x) * 3;
        buffer[idx] = x * 50;     // R
        buffer[idx + 1] = y * 50; // G
        buffer[idx + 2] = 100;    // B
      }
    }

    const roi = extractRoiRgb(buffer, {
      frameWidth: frameW,
      frameHeight: frameH,
      format: 'rgb888',
      roiX: 1,
      roiY: 1,
      roiWidth: 2,
      roiHeight: 2,
    });

    expect(roi.length).toBe(2 * 2 * 3);
    // Top-left pixel of ROI is (1, 1) in frame
    expect(roi[0]).toBe(50);  // R
    expect(roi[1]).toBe(50);  // G
    expect(roi[2]).toBe(100); // B
  });

  test('throws when ROI is out of frame bounds', () => {
    const buffer = new Uint8Array(4 * 4 * 3);
    expect(() =>
      extractRoiRgb(buffer, {
        frameWidth: 4,
        frameHeight: 4,
        format: 'rgb888',
        roiX: 3,
        roiY: 3,
        roiWidth: 2,
        roiHeight: 2,
      }),
    ).toThrow();
  });
});

describe('extractRoiRgb — BGRA8888 format', () => {
  test('extract 1x1 ROI from 2x2 BGRA frame', () => {
    const buffer = new Uint8Array([
      255, 0, 0, 255,   // B=255, G=0, R=0 (Blue)
      0, 255, 0, 255,   // Green
      0, 0, 255, 255,   // B=0, G=0, R=255 (Red)
      128, 128, 128, 255,// Grey
    ]);

    const roi = extractRoiRgb(buffer, {
      frameWidth: 2,
      frameHeight: 2,
      format: 'bgra8888',
      roiX: 1,
      roiY: 0,
      roiWidth: 1,
      roiHeight: 1,
    });

    expect(roi.length).toBe(3);
    // (1,0) in frame is second pixel: B=0, G=255, R=0 → output RGB = [0, 255, 0]
    expect(roi[0]).toBe(0);   // R
    expect(roi[1]).toBe(255); // G
    expect(roi[2]).toBe(0);   // B
  });
});

describe('mapPreviewRoiToFrame', () => {
  test('identity mapping when view matches frame aspect ratio', () => {
    const mapped = mapPreviewRoiToFrame(
      100, 100, 50,  // square centre (100,100), size 50 in view
      200, 200,      // view 200x200
      1000, 1000,    // frame 1000x1000
      0,             // sensorOrientation 0
    );

    // Scale is 5x (1000 / 200)
    // Centre in frame is (500, 500)
    // Size half is 25 * 5 = 125
    // x0 = 500 - 125 = 375, y0 = 375, width = 250, height = 250
    expect(mapped.x).toBe(375);
    expect(mapped.y).toBe(375);
    expect(mapped.width).toBe(250);
    expect(mapped.height).toBe(250);
  });
});
