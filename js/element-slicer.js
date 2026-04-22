export default class ElementSlicer {

  // --- Color space helpers ---

  _rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0, s = max === 0 ? 0 : d / max, v = max;

    if (d !== 0) {
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, v };
  }

  _hueDist(h1, h2) {
    const d = Math.abs(h1 - h2);
    return d > 180 ? 360 - d : d;
  }

  // --- Main background removal ---

  removeBackground(sourceData, bgColor, params = {}) {
    const {
      mode = 'gradient',
      // HSV mode params (gradient)
      innerHue = 15,
      outerHue = 40,
      satThreshold = 0.15,
      valThreshold = 0.10,
      // RGB threshold mode params
      threshold = 50,
      // Shared
      antiAliasDist = 3,
      despillStrength = 1.0,
    } = params;

    const { width, height } = sourceData;
    const src = sourceData.data;
    const out = new ImageData(new Uint8ClampedArray(src), width, height);
    const dst = out.data;

    const keyHsv = this._rgbToHsv(bgColor.r, bgColor.g, bgColor.b);

    // Step 1: Compute alpha
    for (let i = 0; i < dst.length; i += 4) {
      const r = dst[i], g = dst[i + 1], b = dst[i + 2];

      if (mode === 'gradient') {
        // HSV hue-based keying
        const hsv = this._rgbToHsv(r, g, b);
        const hDist = this._hueDist(hsv.h, keyHsv.h);

        // Protect low-saturation pixels (grays, whites) from being keyed
        if (hsv.s < satThreshold) {
          dst[i + 3] = 255;
          continue;
        }
        // Protect dark pixels (blacks, shadows)
        if (hsv.v < valThreshold) {
          dst[i + 3] = 255;
          continue;
        }

        // Also consider saturation similarity to key for better discrimination
        const satFactor = Math.min(1, hsv.s / Math.max(keyHsv.s, 0.01));

        if (hDist <= innerHue && satFactor > 0.3) {
          dst[i + 3] = 0;
        } else if (hDist >= outerHue) {
          dst[i + 3] = 255;
        } else {
          const hueAlpha = (hDist - innerHue) / (outerHue - innerHue);
          dst[i + 3] = Math.round(Math.min(255, hueAlpha * 255));
        }
      } else {
        // Simple RGB threshold mode (unchanged)
        const dist = Math.sqrt(
          (r - bgColor.r) ** 2 +
          (g - bgColor.g) ** 2 +
          (b - bgColor.b) ** 2
        );
        dst[i + 3] = dist > threshold ? 255 : 0;
      }
    }

    // Step 2: Anti-aliasing — smooth edges
    if (antiAliasDist > 0) {
      this._applyAntiAlias(dst, width, height, antiAliasDist);
    }

    // Step 3: Despill — only correct key-color contamination on semi-transparent edge
    // pixels. Interior opaque pixels keep their original colors so legitimate UI colors
    // that happen to share a channel with the key (yellow, cyan, light green, ...) are
    // not shifted. PNG export uses straight alpha, so no premultiplication step.
    if (despillStrength > 0) {
      this._despill(dst, bgColor, despillStrength);
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
        if (origAlpha[idx] === 0) continue;

        let nearTransparent = false;
        for (let dy = -dist; dy <= dist && !nearTransparent; dy++) {
          for (let dx = -dist; dx <= dist && !nearTransparent; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (origAlpha[ny * width + nx] === 0) nearTransparent = true;
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

  _despill(data, bgColor, strength) {
    const { r: kr, g: kg, b: kb } = bgColor;
    let keyChannel;
    if (kg >= kr && kg >= kb) keyChannel = 1;
    else if (kb >= kr && kb >= kg) keyChannel = 2;
    else keyChannel = 0;

    const ch1 = (keyChannel + 1) % 3;
    const ch2 = (keyChannel + 2) % 3;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      // Skip fully transparent and fully opaque pixels — only edge pixels can carry spill.
      if (a === 0 || a === 255) continue;

      const kv = data[i + keyChannel];
      const ov1 = data[i + ch1];
      const ov2 = data[i + ch2];

      // Max suppression: only clamp the key channel when it dominates BOTH other channels.
      // This preserves yellow, cyan, white, and other legitimate non-key colors.
      const maxAllowed = Math.max(ov1, ov2);

      if (kv > maxAllowed) {
        const spill = (kv - maxAllowed) * strength;
        data[i + keyChannel] = Math.round(kv - spill);
      }
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
    // Also build a mapping from element id → set of CCL labels
    const elements = [];
    const labelToId = new Map();
    let id = 1;
    for (const [label, b] of boxes) {
      const w = b.maxX - b.minX + 1;
      const h = b.maxY - b.minY + 1;
      if (w >= minSize && h >= minSize) {
        const elId = id++;
        elements.push({
          id: elId,
          x: b.minX,
          y: b.minY,
          w,
          h,
          pixelCount: b.count,
        });
        labelToId.set(label, elId);
      }
    }

    // Build element ID map: for each pixel, which element ID it belongs to (0 = none)
    const elementMap = new Int32Array(width * height);
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] > 0 && labelToId.has(labels[i])) {
        elementMap[i] = labelToId.get(labels[i]);
      }
    }

    return { elements, elementMap };
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

  /**
   * Auto-merge overlapping/close elements into larger boxes.
   * Uses Union-Find to group all elements connected by overlap chains,
   * then merges each group into one bounding box.
   */
  autoMergeOverlaps(elements, distance = 5) {
    if (elements.length <= 1) return elements;

    // Build Union-Find over element indices
    const n = elements.length;
    const parent = Array.from({ length: n }, (_, i) => i);

    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (a, b) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    // Union all pairs within distance
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = elements[i], b = elements[j];
        const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
        const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
        if (Math.sqrt(gapX ** 2 + gapY ** 2) <= distance) {
          union(i, j);
        }
      }
    }

    // Group by root
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(elements[i]);
    }

    // Merge each group into one bounding box
    const result = [];
    let id = 1;
    for (const [, group] of groups) {
      if (group.length === 1) {
        result.push({ ...group[0], id: id++ });
      } else {
        const minX = Math.min(...group.map((e) => e.x));
        const minY = Math.min(...group.map((e) => e.y));
        const maxX = Math.max(...group.map((e) => e.x + e.w));
        const maxY = Math.max(...group.map((e) => e.y + e.h));
        result.push({
          id: id++,
          x: minX,
          y: minY,
          w: maxX - minX,
          h: maxY - minY,
          pixelCount: group.reduce((s, e) => s + e.pixelCount, 0),
        });
      }
    }

    return result;
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
