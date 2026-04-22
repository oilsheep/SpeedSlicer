export default class BackgroundDetector {
  detect(imageData, sampleSize = 20) {
    const { data, width, height } = imageData;
    const colorCounts = new Map();

    const corners = [
      { x0: 0, y0: 0 },
      { x0: width - sampleSize, y0: 0 },
      { x0: 0, y0: height - sampleSize },
      { x0: width - sampleSize, y0: height - sampleSize },
    ];

    for (const { x0, y0 } of corners) {
      for (let y = y0; y < y0 + sampleSize && y < height; y++) {
        for (let x = x0; x < x0 + sampleSize && x < width; x++) {
          const i = (y * width + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const qr = Math.round(r / 10) * 10;
          const qg = Math.round(g / 10) * 10;
          const qb = Math.round(b / 10) * 10;
          const key = `${qr},${qg},${qb}`;
          colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        }
      }
    }

    let maxCount = 0;
    let bestKey = '0,0,0';
    for (const [key, count] of colorCounts) {
      if (count > maxCount) {
        maxCount = count;
        bestKey = key;
      }
    }

    const [qr, qg, qb] = bestKey.split(',').map(Number);
    let sumR = 0, sumG = 0, sumB = 0, total = 0;

    for (const { x0, y0 } of corners) {
      for (let y = y0; y < y0 + sampleSize && y < height; y++) {
        for (let x = x0; x < x0 + sampleSize && x < width; x++) {
          const i = (y * width + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const cr = Math.round(r / 10) * 10;
          const cg = Math.round(g / 10) * 10;
          const cb = Math.round(b / 10) * 10;
          if (cr === qr && cg === qg && cb === qb) {
            sumR += r;
            sumG += g;
            sumB += b;
            total++;
          }
        }
      }
    }

    return {
      r: Math.round(sumR / total),
      g: Math.round(sumG / total),
      b: Math.round(sumB / total),
    };
  }

  toHex(color) {
    const hex = (v) => v.toString(16).padStart(2, '0');
    return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  }

  fromHex(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }
}
