/**
 * frameConversion.ts
 * Converts raw camera frame pixel data to encoded sRGB uint8 RGB.
 *
 * Called from native frame processor context (Worklet / JSI thread).
 * Receives raw byte buffers from VisionCamera Frame objects.
 *
 * Supported input formats:
 *   - yuv420 (YUV_420_888 on Android)
 *   - bgra8888 (BGRA on Android/iOS)
 *   - rgb888 (full RGB on some devices)
 *
 * Output: Uint8Array of encoded sRGB pixels, row-major RGB (no alpha),
 *         ready for analysePatch().
 *
 * All conversions use the limited-range BT.601 matrix for typical smartphone
 * video streams. If device metadata indicates full-range or BT.709, the
 * correct matrix/range must be passed by the caller.
 *
 * ROI extraction: extract a W×H rectangle from a larger frame.
 */

export type PixelFormat = 'yuv420' | 'bgra8888' | 'rgb888';

export interface FrameConversionOptions {
  /** Frame width in pixels. */
  frameWidth: number;
  /** Frame height in pixels. */
  frameHeight: number;
  /** Format of the input buffer. */
  format: PixelFormat;
  /** ROI in frame coordinates (must be fully inside frame). */
  roiX: number;
  roiY: number;
  roiWidth: number;
  roiHeight: number;
  /**
   * Stride (bytes per row) for the Y plane when format='yuv420'.
   * If undefined, assumed to equal frameWidth.
   */
  yStride?: number;
  /**
   * Stride for the UV plane in yuv420 (bytes per row).
   * If undefined, assumed to equal frameWidth.
   */
  uvStride?: number;
  /**
   * Pixel stride for the UV plane in yuv420 (bytes between adjacent UV pairs).
   * Typically 2 for NV12/NV21, 1 for planar I420.
   */
  uvPixelStride?: number;
  /**
   * For yuv420: true if this is NV21 (VU interleaved) rather than NV12 (UV interleaved).
   * Default: false (NV12/YUV_420_888 default on Android Camera2).
   */
  isNV21?: boolean;
  /**
   * Sensor orientation in degrees. Used to document; ROI mapping must account
   * for rotation BEFORE calling this function.
   */
  sensorOrientation?: 0 | 90 | 180 | 270;
}

/**
 * BT.601 limited-range YCbCr → RGB coefficients.
 * Y in [16,235], Cb/Cr in [16,240].
 */
function yuv601LimitedToRgb(Y: number, Cb: number, Cr: number): [number, number, number] {
  const y = Y - 16;
  const cb = Cb - 128;
  const cr = Cr - 128;
  const r = Math.round(1.164 * y + 1.596 * cr);
  const g = Math.round(1.164 * y - 0.392 * cb - 0.813 * cr);
  const b = Math.round(1.164 * y + 2.017 * cb);
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

/**
 * Extract a region of interest from a camera frame buffer and return
 * encoded sRGB pixels as a Uint8Array (W×H×3, row-major RGB).
 *
 * This is designed to be lightweight and callable in a JSI worklet context.
 * If you pass an incorrectly typed buffer, results are undefined.
 */
export function extractRoiRgb(
  buffer: Uint8Array,
  opts: FrameConversionOptions,
): Uint8Array {
  const {
    frameWidth,
    frameHeight,
    format,
    roiX,
    roiY,
    roiWidth,
    roiHeight,
  } = opts;

  if (
    roiX < 0 || roiY < 0 ||
    roiX + roiWidth > frameWidth ||
    roiY + roiHeight > frameHeight
  ) {
    throw new Error(
      `ROI (${roiX},${roiY} ${roiWidth}×${roiHeight}) out of frame ${frameWidth}×${frameHeight}`,
    );
  }

  const out = new Uint8Array(roiWidth * roiHeight * 3);

  switch (format) {
    case 'rgb888': {
      const stride = frameWidth * 3;
      for (let y = 0; y < roiHeight; y++) {
        for (let x = 0; x < roiWidth; x++) {
          const src = (roiY + y) * stride + (roiX + x) * 3;
          const dst = (y * roiWidth + x) * 3;
          out[dst] = buffer[src];
          out[dst + 1] = buffer[src + 1];
          out[dst + 2] = buffer[src + 2];
        }
      }
      break;
    }

    case 'bgra8888': {
      const stride = frameWidth * 4;
      for (let y = 0; y < roiHeight; y++) {
        for (let x = 0; x < roiWidth; x++) {
          const src = (roiY + y) * stride + (roiX + x) * 4;
          const dst = (y * roiWidth + x) * 3;
          out[dst] = buffer[src + 2];     // B → R
          out[dst + 1] = buffer[src + 1]; // G
          out[dst + 2] = buffer[src];     // R → B
        }
      }
      break;
    }

    case 'yuv420': {
      const yStride = opts.yStride ?? frameWidth;
      const uvStride = opts.uvStride ?? Math.ceil(frameWidth / 2) * 2;
      const uvPixelStride = opts.uvPixelStride ?? 2;
      const isNV21 = opts.isNV21 ?? false;
      const yPlaneSize = yStride * frameHeight;

      for (let ry = 0; ry < roiHeight; ry++) {
        for (let rx = 0; rx < roiWidth; rx++) {
          const absX = roiX + rx;
          const absY = roiY + ry;

          const Y = buffer[absY * yStride + absX];

          // UV sub-sampling (4:2:0)
          const uvRow = Math.floor(absY / 2);
          const uvCol = Math.floor(absX / 2);
          const uvBase = yPlaneSize + uvRow * uvStride + uvCol * uvPixelStride;

          let Cb: number, Cr: number;
          if (isNV21) {
            // VU order
            Cr = buffer[uvBase];
            Cb = buffer[uvBase + 1];
          } else {
            // UV order (NV12 / YUV_420_888 default)
            Cb = buffer[uvBase];
            Cr = buffer[uvBase + 1];
          }

          const [r, g, b] = yuv601LimitedToRgb(Y, Cb, Cr);
          const dst = (ry * roiWidth + rx) * 3;
          out[dst] = r;
          out[dst + 1] = g;
          out[dst + 2] = b;
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported pixel format: ${format}`);
  }

  return out;
}

/**
 * Map a preview-space sampling square to frame-space coordinates.
 *
 * The preview view may apply aspect-fill cropping and be displayed at a
 * different size than the sensor output. This function converts the visible
 * sampling-square centre + size (in preview view points) to the region in the
 * actual sensor/frame buffer.
 *
 * @param squareCentreXView  Centre X of sampling square in view points.
 * @param squareCentreYView  Centre Y of sampling square in view points.
 * @param squareSizeView     Size of the sampling square in view points.
 * @param viewWidth          Width of the camera preview view in points.
 * @param viewHeight         Height of the camera preview view in points.
 * @param frameWidth         Width of the sensor frame buffer in pixels.
 * @param frameHeight        Height of the sensor frame buffer in pixels.
 * @param sensorOrientation  Clockwise rotation of the sensor output in degrees.
 *
 * Returns: { x, y, width, height } in frame pixels, guaranteed inside frame.
 */
export function mapPreviewRoiToFrame(
  squareCentreXView: number,
  squareCentreYView: number,
  squareSizeView: number,
  viewWidth: number,
  viewHeight: number,
  frameWidth: number,
  frameHeight: number,
  sensorOrientation: 0 | 90 | 180 | 270 = 0,
): { x: number; y: number; width: number; height: number } {
  // Effective frame dimensions after accounting for rotation
  let fw = frameWidth;
  let fh = frameHeight;
  if (sensorOrientation === 90 || sensorOrientation === 270) {
    fw = frameHeight;
    fh = frameWidth;
  }

  // Aspect-fill scale: which dimension fills the view
  const scaleX = fw / viewWidth;
  const scaleY = fh / viewHeight;
  const scale = Math.max(scaleX, scaleY); // aspect-fill: larger scale

  // Crop offsets (the frame region that corresponds to what's visible in view)
  const visibleWidth = viewWidth * scale;
  const visibleHeight = viewHeight * scale;
  const cropX = (fw - visibleWidth) / 2;
  const cropY = (fh - visibleHeight) / 2;

  // Map square centre from view space to frame space
  const frameCentreX = squareCentreXView * scale + cropX;
  const frameCentreY = squareCentreYView * scale + cropY;
  const frameSizeHalf = (squareSizeView * scale) / 2;

  let x0 = Math.round(frameCentreX - frameSizeHalf);
  let y0 = Math.round(frameCentreY - frameSizeHalf);
  const size = Math.round(squareSizeView * scale);

  // Clamp to frame bounds
  x0 = Math.max(0, Math.min(x0, fw - size));
  y0 = Math.max(0, Math.min(y0, fh - size));
  const w = Math.min(size, fw - x0);
  const h = Math.min(size, fh - y0);

  // Now un-rotate to match the actual buffer orientation
  // The frame buffer's coordinate system depends on sensor orientation.
  // For Android Camera2 with 90° rotation: (x,y) in rotated space → (y, fw-x) in buffer
  let bx: number, by: number;
  switch (sensorOrientation) {
    case 0:
      bx = x0; by = y0; break;
    case 90:
      // Rotated 90°CW: buffer is portrait, rotated display is landscape
      bx = fh - y0 - h; by = x0; break;
    case 180:
      bx = fw - x0 - w; by = fh - y0 - h; break;
    case 270:
      bx = y0; by = fw - x0 - w; break;
    default:
      bx = x0; by = y0;
  }

  // Final clamp
  bx = Math.max(0, Math.min(bx, frameWidth - 1));
  by = Math.max(0, Math.min(by, frameHeight - 1));
  const bw = Math.min(w, frameWidth - bx);
  const bh = Math.min(h, frameHeight - by);

  return { x: bx, y: by, width: bw, height: bh };
}
