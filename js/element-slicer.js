export default class ElementSlicer {
  removeBackground(sourceData, bgColor, params = {}) {
    const {
      mode = 'gradient',
      innerThreshold = 163,
      outerThreshold = 169,
      threshold = 50,
      antiAliasDist = 3,
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

  findElements(processedData, minSize = 10) {
    const { width, height } = processedData;
    const data = processedData.data;
    const labels = new Int32Array(width * height);
    const parent = [0]; // Union-Find parent array, index 0 unused

    let nextLabel = 1;

    // Pass 1: assign provisional labels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const alpha = data[idx * 4 + 3];
        if (alpha === 0) continue;

        const neighbors = [];
        if (x > 0 && labels[idx - 1] > 0) {
          neighbors.push(labels[idx - 1]);
        }
        if (y > 0 && labels[idx - width] > 0) {
          neighbors.push(labels[idx - width]);
        }
        if (x > 0 && y > 0 && labels[idx - width - 1] > 0) {
          neighbors.push(labels[idx - width - 1]);
        }
        if (x < width - 1 && y > 0 && labels[idx - width + 1] > 0) {
          neighbors.push(labels[idx - width + 1]);
        }

        if (neighbors.length === 0) {
          labels[idx] = nextLabel;
          parent.push(nextLabel);
          nextLabel++;
        } else {
          const minLabel = Math.min(...neighbors);
          labels[idx] = minLabel;
          for (const n of neighbors) {
            this._union(parent, minLabel, n);
          }
        }
      }
    }

    // Pass 2: flatten labels
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] > 0) {
        labels[i] = this._find(parent, labels[i]);
      }
    }

    // Collect bounding boxes
    const boxes = new Map();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const label = labels[y * width + x];
        if (label === 0) continue;

        if (!boxes.has(label)) {
          boxes.set(label, { minX: x, minY: y, maxX: x, maxY: y, count: 0 });
        }
        const b = boxes.get(label);
        b.minX = Math.min(b.minX, x);
        b.minY = Math.min(b.minY, y);
        b.maxX = Math.max(b.maxX, x);
        b.maxY = Math.max(b.maxY, y);
        b.count++;
      }
    }

    // Filter by minimum size and build result
    const elements = [];
    let id = 1;
    for (const [, b] of boxes) {
      const w = b.maxX - b.minX + 1;
      const h = b.maxY - b.minY + 1;
      if (w >= minSize && h >= minSize) {
        elements.push({
          id: id++,
          x: b.minX,
          y: b.minY,
          w,
          h,
          pixelCount: b.count,
        });
      }
    }

    return elements;
  }

  detectOverlaps(elements, distance = 5) {
    const pairs = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i];
        const b = elements[j];

        const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
        const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
        const gap = Math.sqrt(gapX ** 2 + gapY ** 2);

        if (gap <= distance) {
          pairs.push([a.id, b.id]);
        }
      }
    }
    return pairs;
  }

  mergeElements(elements, idA, idB) {
    const a = elements.find((e) => e.id === idA);
    const b = elements.find((e) => e.id === idB);
    if (!a || !b) return elements;

    const merged = {
      id: Math.min(a.id, b.id),
      name: a.name || b.name,
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: 0,
      h: 0,
      pixelCount: a.pixelCount + b.pixelCount,
    };
    merged.w = Math.max(a.x + a.w, b.x + b.w) - merged.x;
    merged.h = Math.max(a.y + a.h, b.y + b.h) - merged.y;

    return elements
      .filter((e) => e.id !== idA && e.id !== idB)
      .concat(merged)
      .sort((a, b) => a.id - b.id);
  }

  _find(parent, x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  _union(parent, a, b) {
    const ra = this._find(parent, a);
    const rb = this._find(parent, b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  }
}
