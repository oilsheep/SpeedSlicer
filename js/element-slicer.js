export default class ElementSlicer {
  removeBackground(sourceData, bgColor, params = {}) {
    const {
      mode = 'gradient',
      innerThreshold = 30,
      outerThreshold = 80,
      threshold = 50,
      antiAliasDist = 1,
    } = params;

    const { width, height } = sourceData;
    const src = sourceData.data;
    const out = new ImageData(new Uint8ClampedArray(src), width, height);
    const dst = out.data;

    // Step 1: Compute raw alpha for each pixel based on color distance
    for (let i = 0; i < dst.length; i += 4) {
      const r = dst[i], g = dst[i + 1], b = dst[i + 2];
      const dist = Math.sqrt(
        (r - bgColor.r) ** 2 +
        (g - bgColor.g) ** 2 +
        (b - bgColor.b) ** 2
      );

      if (mode === 'gradient') {
        if (dist <= innerThreshold) {
          dst[i + 3] = 0;
        } else if (dist >= outerThreshold) {
          dst[i + 3] = 255;
        } else {
          dst[i + 3] = Math.round(
            ((dist - innerThreshold) / (outerThreshold - innerThreshold)) * 255
          );
        }
      } else {
        dst[i + 3] = dist > threshold ? 255 : 0;
      }
    }

    // Step 2: Anti-aliasing
    if (antiAliasDist > 0) {
      this._applyAntiAlias(dst, width, height, antiAliasDist);
    }

    // Step 3: Color decontamination (gradient mode only)
    if (mode === 'gradient') {
      this._decontaminate(dst, bgColor);
    }

    return out;
  }

  _applyAntiAlias(data, width, height, dist) {
    const totalPixels = width * height;
    const isEdge = new Uint8Array(totalPixels);
    const origAlpha = new Uint8Array(totalPixels);

    for (let idx = 0; idx < totalPixels; idx++) {
      origAlpha[idx] = data[idx * 4 + 3];
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const a = origAlpha[idx];
        if (a === 0) continue;

        let nearTransparent = false;
        for (let dy = -dist; dy <= dist && !nearTransparent; dy++) {
          for (let dx = -dist; dx <= dist && !nearTransparent; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (origAlpha[ny * width + nx] === 0) {
              nearTransparent = true;
            }
          }
        }
        if (nearTransparent) isEdge[idx] = 1;
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!isEdge[idx]) continue;

        let opaqueCount = 0, totalCount = 0;
        for (let dy = -dist; dy <= dist; dy++) {
          for (let dx = -dist; dx <= dist; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            totalCount++;
            if (origAlpha[ny * width + nx] > 0) opaqueCount++;
          }
        }
        const ratio = opaqueCount / totalCount;
        data[idx * 4 + 3] = Math.round(
          Math.min(origAlpha[idx], origAlpha[idx] * ratio)
        );
      }
    }
  }

  _decontaminate(data, bgColor) {
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0 || a === 255) continue;

      const factor = 1 - a / 255;
      data[i]     = Math.round(data[i]     + (255 - data[i])     * factor);
      data[i + 1] = Math.round(data[i + 1] + (255 - data[i + 1]) * factor);
      data[i + 2] = Math.round(data[i + 2] + (255 - data[i + 2]) * factor);
    }
  }
}
