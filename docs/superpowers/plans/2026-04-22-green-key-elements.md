# Green Key Elements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-frontend web app that removes solid-color backgrounds from game UI sprite sheets, auto-detects individual elements, and exports them as transparent PNGs.

**Architecture:** Four modules — ImageLoader (file input → pixel data), BackgroundDetector (auto-detect background color), ElementSlicer (background removal + connected component labeling + overlap detection), UIController (UI state management and rendering). Left-right layout with canvas preview on left and controls + element list on right.

**Tech Stack:** Vanilla JS, Canvas 2D API, JSZip (ZIP export). No build tools, no frameworks.

---

## File Structure

```
green-key-elements/
├── index.html              # Single entry point, all HTML structure
├── css/
│   └── style.css           # All styles: layout, controls, canvas, element list
├── js/
│   ├── app.js              # Entry point: instantiate modules, wire events
│   ├── image-loader.js     # ImageLoader class: file input → ImageData
│   ├── bg-detector.js      # BackgroundDetector class: corner sampling → dominant color
│   ├── element-slicer.js   # ElementSlicer class: removeBackground(), findElements(), detectOverlaps()
│   └── ui-controller.js    # UIController class: canvas rendering, panel state, interactions
├── lib/
│   └── jszip.min.js        # JSZip library
└── test-file/              # Existing test images
```

Each module is a single ES6 class exported as default. Modules communicate through method calls orchestrated by `app.js`. No event bus, no pub/sub — direct calls keep the flow explicit.

---

### Task 1: Project Scaffolding — HTML + CSS + JSZip

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/app.js` (empty entry point)
- Create: `lib/jszip.min.js`

- [ ] **Step 1: Create index.html with full layout structure**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Green Key Elements</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="app">
    <!-- Top bar -->
    <header id="header">
      <h1>Green Key Elements</h1>
    </header>

    <div id="main">
      <!-- Left: Canvas area -->
      <div id="canvas-area">
        <div id="drop-zone">
          <p>拖放圖片到這裡，或點擊選擇檔案</p>
          <input type="file" id="file-input" accept="image/*" />
        </div>
        <canvas id="preview-canvas"></canvas>
        <div id="canvas-controls">
          <span id="zoom-level">100%</span>
        </div>
      </div>

      <!-- Right: Control panel -->
      <div id="panel">
        <!-- Settings section -->
        <div id="settings-section" class="panel-section">
          <h3>設定</h3>

          <!-- Background color -->
          <div class="control-group">
            <label>背景色</label>
            <div id="bg-color-row">
              <div id="bg-color-swatch"></div>
              <input type="color" id="bg-color-picker" value="#00ff00" />
              <button id="bg-eyedropper-btn" title="從圖片取色">🎯</button>
            </div>
          </div>

          <!-- Mode toggle -->
          <div class="control-group">
            <label>去背模式</label>
            <div id="mode-toggle">
              <button id="mode-gradient" class="mode-btn active">漸變</button>
              <button id="mode-threshold" class="mode-btn">閾值</button>
            </div>
          </div>

          <!-- Gradient mode params -->
          <div id="gradient-params" class="param-group">
            <div class="control-group">
              <label>內圈閾值 <span id="inner-val">30</span></label>
              <input type="range" id="inner-threshold" min="0" max="255" value="30" />
            </div>
            <div class="control-group">
              <label>外圈閾值 <span id="outer-val">80</span></label>
              <input type="range" id="outer-threshold" min="0" max="255" value="80" />
            </div>
            <div class="control-group">
              <label>抗鋸齒距離 <span id="gradient-aa-val">1</span>px</label>
              <input type="range" id="gradient-aa-dist" min="0" max="5" value="1" />
            </div>
          </div>

          <!-- Threshold mode params -->
          <div id="threshold-params" class="param-group" style="display:none;">
            <div class="control-group">
              <label>閾值 <span id="thresh-val">50</span></label>
              <input type="range" id="threshold-value" min="0" max="255" value="50" />
            </div>
            <div class="control-group">
              <label>抗鋸齒距離 <span id="thresh-aa-val">1</span>px</label>
              <input type="range" id="thresh-aa-dist" min="0" max="5" value="1" />
            </div>
          </div>

          <!-- Element detection params -->
          <div class="control-group">
            <label>最小元件尺寸 <span id="min-size-val">10</span>px</label>
            <input type="range" id="min-element-size" min="1" max="100" value="10" />
          </div>
          <div class="control-group">
            <label>重疊偵測距離 <span id="overlap-dist-val">5</span>px</label>
            <input type="range" id="overlap-distance" min="0" max="50" value="5" />
          </div>
        </div>

        <!-- Element list section -->
        <div id="elements-section" class="panel-section">
          <h3>元件列表 (<span id="element-count">0</span>)</h3>
          <div id="element-list"></div>
        </div>
      </div>
    </div>

    <!-- Bottom: Export bar -->
    <footer id="export-bar">
      <div class="control-group export-padding">
        <label>Padding <span id="padding-val">0</span>px</label>
        <input type="range" id="export-padding" min="0" max="20" value="0" />
      </div>
      <button id="export-selected" class="btn-primary" disabled>匯出選取的元件</button>
      <button id="export-all" class="btn-secondary" disabled>全部匯出</button>
    </footer>
  </div>

  <script src="lib/jszip.min.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create css/style.css with full layout styling**

```css
/* === Reset & Base === */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
}

/* === App Layout === */
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

#header {
  padding: 8px 16px;
  background: #16213e;
  border-bottom: 1px solid #333;
}
#header h1 {
  font-size: 16px;
  color: #e94560;
}

#main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* === Canvas Area (left) === */
#canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #0f0f1a;
}

#drop-zone {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed #555;
  margin: 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}
#drop-zone:hover, #drop-zone.drag-over {
  border-color: #e94560;
}
#drop-zone p {
  color: #888;
  font-size: 14px;
}
#drop-zone.hidden { display: none; }

#file-input { display: none; }

#preview-canvas {
  display: none;
  position: absolute;
  top: 0;
  left: 0;
  cursor: grab;
}
#preview-canvas.active {
  display: block;
}
#preview-canvas.grabbing { cursor: grabbing; }

#canvas-controls {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0,0,0,0.6);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  display: none;
}
#canvas-controls.active { display: block; }

/* === Panel (right) === */
#panel {
  width: 280px;
  background: #16213e;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.panel-section {
  padding: 12px;
  border-bottom: 1px solid #333;
}
.panel-section h3 {
  font-size: 13px;
  color: #e94560;
  margin-bottom: 10px;
}

/* === Controls === */
.control-group {
  margin-bottom: 10px;
}
.control-group label {
  display: block;
  font-size: 12px;
  color: #aaa;
  margin-bottom: 4px;
}
.control-group input[type="range"] {
  width: 100%;
  accent-color: #e94560;
}

#bg-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
#bg-color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #00ff00;
}
#bg-color-picker {
  width: 28px;
  height: 28px;
  border: none;
  padding: 0;
  cursor: pointer;
}
#bg-eyedropper-btn {
  background: none;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
}
#bg-eyedropper-btn:hover { border-color: #e94560; }
#bg-eyedropper-btn.active {
  background: #e94560;
  border-color: #e94560;
}

#mode-toggle {
  display: flex;
  gap: 4px;
}
.mode-btn {
  flex: 1;
  padding: 6px;
  background: #0f3460;
  border: 1px solid #333;
  color: #aaa;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.mode-btn.active {
  background: #e94560;
  color: white;
  border-color: #e94560;
}

/* === Element List === */
#elements-section {
  flex: 1;
  overflow-y: auto;
}
#element-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.element-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #0f3460;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  font-size: 12px;
}
.element-item:hover { border-color: #555; }
.element-item.selected { border-color: #e94560; }
.element-item.overlap { border-color: #f0a500; }

.element-item input[type="checkbox"] {
  accent-color: #e94560;
  flex-shrink: 0;
}
.element-item .thumb {
  width: 32px;
  height: 32px;
  background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0/8px 8px;
  border-radius: 2px;
  flex-shrink: 0;
  overflow: hidden;
}
.element-item .thumb canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.element-item .name {
  flex: 1;
  min-width: 0;
}
.element-item .name input {
  width: 100%;
  background: transparent;
  border: none;
  color: #e0e0e0;
  font-size: 12px;
  outline: none;
}
.element-item .name input:focus {
  border-bottom: 1px solid #e94560;
}
.element-item .download-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  flex-shrink: 0;
}
.element-item .download-btn:hover { color: #e94560; }

/* === Export Bar === */
#export-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #16213e;
  border-top: 1px solid #333;
}
#export-bar .export-padding {
  margin-bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
#export-bar .export-padding label {
  white-space: nowrap;
  margin-bottom: 0;
}
#export-bar .export-padding input[type="range"] {
  width: 80px;
}

.btn-primary {
  padding: 8px 16px;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.btn-primary:hover { background: #c73e54; }
.btn-primary:disabled { background: #555; cursor: not-allowed; }

.btn-secondary {
  padding: 8px 16px;
  background: #0f3460;
  color: #e0e0e0;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.btn-secondary:hover { background: #1a4a8a; }
.btn-secondary:disabled { background: #333; color: #666; cursor: not-allowed; }

/* === Context Menu === */
.context-menu {
  position: fixed;
  background: #16213e;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px 0;
  z-index: 1000;
  min-width: 120px;
}
.context-menu-item {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  color: #e0e0e0;
}
.context-menu-item:hover {
  background: #0f3460;
}
```

- [ ] **Step 3: Create empty js/app.js entry point**

```js
// app.js — entry point, will be populated in later tasks
```

- [ ] **Step 4: Download JSZip to lib/jszip.min.js**

Run:
```bash
mkdir -p lib
curl -L "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js" -o lib/jszip.min.js
```

Expected: `jszip.min.js` file created, ~100KB.

- [ ] **Step 5: Verify page loads in browser**

Run:
```bash
npx serve . -l 3000 &
```

Open `http://localhost:3000` in browser. Expected: dark-themed page with left drop zone, right panel with controls, and bottom export bar. Stop the server after verifying.

- [ ] **Step 6: Commit**

```bash
git init
git add index.html css/style.css js/app.js lib/jszip.min.js
git commit -m "feat: scaffold HTML/CSS layout with controls and JSZip"
```

---

### Task 2: ImageLoader Module

**Files:**
- Create: `js/image-loader.js`

- [ ] **Step 1: Create js/image-loader.js**

```js
export default class ImageLoader {
  constructor() {
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    this.imageData = null;
    this.width = 0;
    this.height = 0;
    this.originalImage = null;
  }

  /**
   * Load an image from a File object.
   * Returns a promise that resolves with { imageData, width, height }.
   */
  loadFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('Invalid image file'));
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        this.width = img.naturalWidth;
        this.height = img.naturalHeight;
        this._canvas.width = this.width;
        this._canvas.height = this.height;
        this._ctx.drawImage(img, 0, 0);
        this.imageData = this._ctx.getImageData(0, 0, this.width, this.height);
        this.originalImage = img;
        resolve({
          imageData: this.imageData,
          width: this.width,
          height: this.height,
          image: img,
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  /**
   * Get a fresh copy of the original pixel data (unmodified).
   */
  getOriginalData() {
    if (!this.originalImage) return null;
    this._ctx.drawImage(this.originalImage, 0, 0);
    return this._ctx.getImageData(0, 0, this.width, this.height);
  }

  /**
   * Get the color [r, g, b, a] at pixel (x, y) from original image.
   */
  getPixelColor(x, y) {
    if (!this.imageData) return null;
    const i = (y * this.width + x) * 4;
    const d = this.imageData.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }
}
```

- [ ] **Step 2: Verify module loads without errors**

Add a temporary test in `js/app.js`:

```js
import ImageLoader from './image-loader.js';
const loader = new ImageLoader();
console.log('ImageLoader loaded:', loader);
```

Open browser console at `http://localhost:3000`. Expected: `ImageLoader loaded: ImageLoader {}` printed.

- [ ] **Step 3: Revert app.js to empty, commit**

Revert `js/app.js` back to the empty placeholder:

```js
// app.js — entry point, will be populated in later tasks
```

```bash
git add js/image-loader.js js/app.js
git commit -m "feat: add ImageLoader module — file input to pixel data"
```

---

### Task 3: BackgroundDetector Module

**Files:**
- Create: `js/bg-detector.js`

- [ ] **Step 1: Create js/bg-detector.js**

```js
export default class BackgroundDetector {
  /**
   * Detect the dominant background color by sampling the four corners.
   * @param {ImageData} imageData
   * @param {number} sampleSize - pixels to sample from each corner (default 20)
   * @returns {{ r: number, g: number, b: number }}
   */
  detect(imageData, sampleSize = 20) {
    const { data, width, height } = imageData;
    const colorCounts = new Map();

    const corners = [
      { x0: 0, y0: 0 },                                         // top-left
      { x0: width - sampleSize, y0: 0 },                         // top-right
      { x0: 0, y0: height - sampleSize },                        // bottom-left
      { x0: width - sampleSize, y0: height - sampleSize },       // bottom-right
    ];

    for (const { x0, y0 } of corners) {
      for (let y = y0; y < y0 + sampleSize && y < height; y++) {
        for (let x = x0; x < x0 + sampleSize && x < width; x++) {
          const i = (y * width + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Quantize to tolerance=10 buckets to group similar colors
          const qr = Math.round(r / 10) * 10;
          const qg = Math.round(g / 10) * 10;
          const qb = Math.round(b / 10) * 10;
          const key = `${qr},${qg},${qb}`;
          colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        }
      }
    }

    // Find the most frequent quantized color
    let maxCount = 0;
    let bestKey = '0,0,0';
    for (const [key, count] of colorCounts) {
      if (count > maxCount) {
        maxCount = count;
        bestKey = key;
      }
    }

    // Now find the actual average of all pixels that fall into that bucket
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

  /**
   * Convert {r,g,b} to hex string.
   */
  toHex(color) {
    const hex = (v) => v.toString(16).padStart(2, '0');
    return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  }

  /**
   * Parse hex string to {r,g,b}.
   */
  fromHex(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }
}
```

- [ ] **Step 2: Verify module loads, commit**

Quick browser console test (temporary app.js edit), then revert.

```bash
git add js/bg-detector.js
git commit -m "feat: add BackgroundDetector — corner sampling for dominant color"
```

---

### Task 4: ElementSlicer — Background Removal

**Files:**
- Create: `js/element-slicer.js`

- [ ] **Step 1: Create js/element-slicer.js with background removal**

```js
export default class ElementSlicer {
  /**
   * Remove background from imageData.
   * Returns a new ImageData with alpha channel modified.
   *
   * @param {ImageData} sourceData - original pixel data
   * @param {{ r: number, g: number, b: number }} bgColor
   * @param {object} params
   * @param {'gradient'|'threshold'} params.mode
   * @param {number} params.innerThreshold - gradient mode inner (default 30)
   * @param {number} params.outerThreshold - gradient mode outer (default 80)
   * @param {number} params.threshold - threshold mode value (default 50)
   * @param {number} params.antiAliasDist - anti-alias distance in px (default 1)
   * @returns {ImageData}
   */
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
    // Create a copy so we don't mutate the original
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
        // threshold mode
        dst[i + 3] = dist > threshold ? 255 : 0;
      }
    }

    // Step 2: Anti-aliasing — smooth edges based on neighbor alpha
    if (antiAliasDist > 0) {
      this._applyAntiAlias(dst, width, height, antiAliasDist);
    }

    // Step 3: Color decontamination (gradient mode only)
    if (mode === 'gradient') {
      this._decontaminate(dst, bgColor);
    }

    return out;
  }

  /**
   * Anti-alias edges: for pixels near transparent/opaque boundary,
   * blend alpha based on ratio of opaque neighbors within distance.
   */
  _applyAntiAlias(data, width, height, dist) {
    // First, find edge pixels (opaque pixels adjacent to transparent)
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
        if (a === 0) continue; // skip fully transparent

        // Check if any neighbor within dist is transparent
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

    // For edge pixels, recompute alpha as weighted average of neighbors
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

  /**
   * Color decontamination: shift semi-transparent pixel colors away
   * from the background color toward white.
   */
  _decontaminate(data, bgColor) {
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0 || a === 255) continue; // skip fully transparent/opaque

      const factor = 1 - a / 255; // how much to shift toward white
      data[i]     = Math.round(data[i]     + (255 - data[i])     * factor); // R
      data[i + 1] = Math.round(data[i + 1] + (255 - data[i + 1]) * factor); // G
      data[i + 2] = Math.round(data[i + 2] + (255 - data[i + 2]) * factor); // B
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/element-slicer.js
git commit -m "feat: add ElementSlicer — background removal with gradient/threshold modes"
```

---

### Task 5: ElementSlicer — Connected Component Labeling

**Files:**
- Modify: `js/element-slicer.js`

- [ ] **Step 1: Add findElements() method to ElementSlicer**

Append these methods to the `ElementSlicer` class, before the closing `}`:

```js
  /**
   * Find connected components in the processed image data.
   * Returns array of { id, x, y, w, h, pixelCount }.
   *
   * @param {ImageData} processedData - after removeBackground()
   * @param {number} minSize - minimum bounding box dimension (default 10)
   * @returns {Array<{ id: number, x: number, y: number, w: number, h: number, pixelCount: number }>}
   */
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
        // Check left
        if (x > 0 && labels[idx - 1] > 0) {
          neighbors.push(labels[idx - 1]);
        }
        // Check top
        if (y > 0 && labels[idx - width] > 0) {
          neighbors.push(labels[idx - width]);
        }
        // Check top-left
        if (x > 0 && y > 0 && labels[idx - width - 1] > 0) {
          neighbors.push(labels[idx - width - 1]);
        }
        // Check top-right
        if (x < width - 1 && y > 0 && labels[idx - width + 1] > 0) {
          neighbors.push(labels[idx - width + 1]);
        }

        if (neighbors.length === 0) {
          labels[idx] = nextLabel;
          parent.push(nextLabel); // parent[nextLabel] = nextLabel
          nextLabel++;
        } else {
          const minLabel = Math.min(...neighbors);
          labels[idx] = minLabel;
          // Union all neighbor labels
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

  // Union-Find helpers
  _find(parent, x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
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
```

- [ ] **Step 2: Commit**

```bash
git add js/element-slicer.js
git commit -m "feat: add connected component labeling for element detection"
```

---

### Task 6: ElementSlicer — Overlap Detection

**Files:**
- Modify: `js/element-slicer.js`

- [ ] **Step 1: Add detectOverlaps() method to ElementSlicer**

Append this method to the `ElementSlicer` class:

```js
  /**
   * Detect pairs of elements whose bounding boxes overlap or are close.
   * Returns array of [idA, idB] pairs.
   *
   * @param {Array<{ id: number, x: number, y: number, w: number, h: number }>} elements
   * @param {number} distance - max gap in px to count as "close" (default 5)
   * @returns {Array<[number, number]>}
   */
  detectOverlaps(elements, distance = 5) {
    const pairs = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i];
        const b = elements[j];

        // Calculate gap between bounding boxes
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
   * Merge two elements into one by combining their bounding boxes.
   * Returns a new elements array with the merged result.
   *
   * @param {Array} elements
   * @param {number} idA
   * @param {number} idB
   * @returns {Array}
   */
  mergeElements(elements, idA, idB) {
    const a = elements.find((e) => e.id === idA);
    const b = elements.find((e) => e.id === idB);
    if (!a || !b) return elements;

    const merged = {
      id: Math.min(a.id, b.id),
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
```

- [ ] **Step 2: Commit**

```bash
git add js/element-slicer.js
git commit -m "feat: add overlap detection and element merging"
```

---

### Task 7: UIController — Canvas Rendering & Zoom/Pan

**Files:**
- Create: `js/ui-controller.js`

- [ ] **Step 1: Create js/ui-controller.js with canvas rendering**

```js
export default class UIController {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // View state
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Data state
    this.originalImage = null;   // HTMLImageElement
    this.processedData = null;   // ImageData after bg removal
    this.elements = [];          // detected elements with bounding boxes
    this.overlaps = [];          // [idA, idB] pairs
    this.selectedElementId = null;
    this.checkedIds = new Set();

    // Interaction state
    this.eyedropperMode = false;
    this.drawingBox = null;      // { startX, startY, endX, endY } for new box
    this.draggingElement = null;  // { id, offsetX, offsetY }
    this.resizingElement = null;  // { id, handle, startX, startY, origBox }

    // Checkerboard pattern (cached)
    this._checkerPattern = null;

    this._setupCanvasEvents();
  }

  _setupCanvasEvents() {
    const area = this.canvas.parentElement;

    // Zoom with scroll wheel
    area.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, this.zoom * delta));

      // Zoom toward mouse position
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
      this.panY = my - (my - this.panY) * (newZoom / this.zoom);

      this.zoom = newZoom;
      this.render();
      this._updateZoomDisplay();
    }, { passive: false });

    // Pan and interactions
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));

    // Context menu for element items (handled in app.js)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Convert screen (mouse) coordinates to image pixel coordinates.
   */
  screenToImage(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = sx - rect.left;
    const cy = sy - rect.top;
    return {
      x: Math.floor((cx - this.panX) / this.zoom),
      y: Math.floor((cy - this.panY) / this.zoom),
    };
  }

  _onMouseDown(e) {
    const imgPos = this.screenToImage(e.clientX, e.clientY);

    // Eyedropper mode
    if (this.eyedropperMode) {
      if (this.onEyedrop) this.onEyedrop(imgPos.x, imgPos.y);
      return;
    }

    // Check if clicking on a resize handle (8px corner squares)
    const handle = this._hitTestHandle(imgPos.x, imgPos.y);
    if (handle) {
      this.resizingElement = handle;
      return;
    }

    // Check if clicking on an element box
    const hitEl = this._hitTestElement(imgPos.x, imgPos.y);
    if (hitEl) {
      if (e.button === 0) {
        // Left click: select + start drag
        this.selectedElementId = hitEl.id;
        this.draggingElement = {
          id: hitEl.id,
          offsetX: imgPos.x - hitEl.x,
          offsetY: imgPos.y - hitEl.y,
        };
        if (this.onElementSelect) this.onElementSelect(hitEl.id);
        this.render();
      }
      return;
    }

    // Check if clicking on empty space with shift held — draw new box
    if (e.shiftKey) {
      this.drawingBox = {
        startX: imgPos.x, startY: imgPos.y,
        endX: imgPos.x, endY: imgPos.y,
      };
      return;
    }

    // Otherwise: pan
    this.isPanning = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.canvas.classList.add('grabbing');
  }

  _onMouseMove(e) {
    if (this.isPanning) {
      this.panX += e.clientX - this.lastMouseX;
      this.panY += e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    if (this.draggingElement) {
      const imgPos = this.screenToImage(e.clientX, e.clientY);
      const el = this.elements.find((el) => el.id === this.draggingElement.id);
      if (el) {
        el.x = imgPos.x - this.draggingElement.offsetX;
        el.y = imgPos.y - this.draggingElement.offsetY;
        this.render();
      }
      return;
    }

    if (this.resizingElement) {
      const imgPos = this.screenToImage(e.clientX, e.clientY);
      this._applyResize(imgPos.x, imgPos.y);
      this.render();
      return;
    }

    if (this.drawingBox) {
      const imgPos = this.screenToImage(e.clientX, e.clientY);
      this.drawingBox.endX = imgPos.x;
      this.drawingBox.endY = imgPos.y;
      this.render();
      return;
    }
  }

  _onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.classList.remove('grabbing');
      return;
    }

    if (this.draggingElement) {
      this.draggingElement = null;
      if (this.onElementsChanged) this.onElementsChanged();
      return;
    }

    if (this.resizingElement) {
      this.resizingElement = null;
      if (this.onElementsChanged) this.onElementsChanged();
      return;
    }

    if (this.drawingBox) {
      const box = this.drawingBox;
      this.drawingBox = null;
      const x = Math.min(box.startX, box.endX);
      const y = Math.min(box.startY, box.endY);
      const w = Math.abs(box.endX - box.startX);
      const h = Math.abs(box.endY - box.startY);
      if (w > 5 && h > 5) {
        if (this.onNewBox) this.onNewBox({ x, y, w, h });
      }
      this.render();
      return;
    }
  }

  _hitTestElement(ix, iy) {
    // Search in reverse order (topmost first)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (ix >= el.x && ix <= el.x + el.w && iy >= el.y && iy <= el.y + el.h) {
        return el;
      }
    }
    return null;
  }

  _hitTestHandle(ix, iy) {
    const handleSize = 6 / this.zoom; // 6 screen px
    for (const el of this.elements) {
      const corners = [
        { name: 'nw', x: el.x, y: el.y },
        { name: 'ne', x: el.x + el.w, y: el.y },
        { name: 'sw', x: el.x, y: el.y + el.h },
        { name: 'se', x: el.x + el.w, y: el.y + el.h },
      ];
      for (const c of corners) {
        if (Math.abs(ix - c.x) <= handleSize && Math.abs(iy - c.y) <= handleSize) {
          return {
            id: el.id,
            handle: c.name,
            startX: ix,
            startY: iy,
            origBox: { ...el },
          };
        }
      }
    }
    return null;
  }

  _applyResize(ix, iy) {
    const r = this.resizingElement;
    const el = this.elements.find((e) => e.id === r.id);
    if (!el) return;

    const dx = ix - r.startX;
    const dy = iy - r.startY;
    const o = r.origBox;

    switch (r.handle) {
      case 'nw':
        el.x = o.x + dx; el.y = o.y + dy;
        el.w = o.w - dx; el.h = o.h - dy;
        break;
      case 'ne':
        el.y = o.y + dy;
        el.w = o.w + dx; el.h = o.h - dy;
        break;
      case 'sw':
        el.x = o.x + dx;
        el.w = o.w - dx; el.h = o.h + dy;
        break;
      case 'se':
        el.w = o.w + dx; el.h = o.h + dy;
        break;
    }

    // Enforce minimum size
    if (el.w < 5) el.w = 5;
    if (el.h < 5) el.h = 5;
  }

  _updateZoomDisplay() {
    const display = document.getElementById('zoom-level');
    if (display) display.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  /**
   * Create a checkerboard pattern for transparent areas.
   */
  _getCheckerPattern() {
    if (this._checkerPattern) return this._checkerPattern;
    const size = 8;
    const pc = document.createElement('canvas');
    pc.width = size * 2;
    pc.height = size * 2;
    const pctx = pc.getContext('2d');
    pctx.fillStyle = '#ccc';
    pctx.fillRect(0, 0, size * 2, size * 2);
    pctx.fillStyle = '#999';
    pctx.fillRect(0, 0, size, size);
    pctx.fillRect(size, size, size, size);
    this._checkerPattern = this.ctx.createPattern(pc, 'repeat');
    return this._checkerPattern;
  }

  /**
   * Full render of canvas: checkerboard + processed image + bounding boxes.
   */
  render() {
    if (!this.processedData) return;

    const { width, height } = this.processedData;
    const area = this.canvas.parentElement;
    this.canvas.width = area.clientWidth;
    this.canvas.height = area.clientHeight;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Draw checkerboard background under the image area
    ctx.save();
    ctx.fillStyle = this._getCheckerPattern();
    // Scale the pattern inversely so checkers stay constant screen size
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Draw processed image
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    tmpCanvas.getContext('2d').putImageData(this.processedData, 0, 0);
    ctx.drawImage(tmpCanvas, 0, 0);

    // Draw element bounding boxes
    const overlapIds = new Set();
    for (const [a, b] of this.overlaps) {
      overlapIds.add(a);
      overlapIds.add(b);
    }

    for (const el of this.elements) {
      const isSelected = el.id === this.selectedElementId;
      const isOverlap = overlapIds.has(el.id);

      ctx.strokeStyle = isSelected ? '#e94560' : isOverlap ? '#f0a500' : '#4fc3f7';
      ctx.lineWidth = (isSelected ? 2 : 1) / this.zoom;
      ctx.setLineDash(isOverlap ? [4 / this.zoom, 4 / this.zoom] : []);
      ctx.strokeRect(el.x, el.y, el.w, el.h);

      // Draw resize handles for selected element
      if (isSelected) {
        const hs = 4 / this.zoom;
        ctx.fillStyle = '#e94560';
        for (const [hx, hy] of [
          [el.x, el.y], [el.x + el.w, el.y],
          [el.x, el.y + el.h], [el.x + el.w, el.y + el.h],
        ]) {
          ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
        }
      }

      // Draw label
      ctx.setLineDash([]);
      const fontSize = Math.max(10, 12 / this.zoom);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const label = el.name || `element_${String(el.id).padStart(3, '0')}`;
      const tm = ctx.measureText(label);
      ctx.fillRect(el.x, el.y - fontSize - 2, tm.width + 4, fontSize + 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, el.x + 2, el.y - 3);
    }

    // Draw new box being created
    if (this.drawingBox) {
      const b = this.drawingBox;
      ctx.strokeStyle = '#4caf50';
      ctx.lineWidth = 1 / this.zoom;
      ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
      ctx.strokeRect(
        Math.min(b.startX, b.endX),
        Math.min(b.startY, b.endY),
        Math.abs(b.endX - b.startX),
        Math.abs(b.endY - b.startY)
      );
    }

    ctx.restore();
  }

  /**
   * Fit image to viewport with some padding.
   */
  fitToView(imgWidth, imgHeight) {
    const area = this.canvas.parentElement;
    const padFraction = 0.9;
    const scaleX = (area.clientWidth * padFraction) / imgWidth;
    const scaleY = (area.clientHeight * padFraction) / imgHeight;
    this.zoom = Math.min(scaleX, scaleY, 1);
    this.panX = (area.clientWidth - imgWidth * this.zoom) / 2;
    this.panY = (area.clientHeight - imgHeight * this.zoom) / 2;
    this._updateZoomDisplay();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui-controller.js
git commit -m "feat: add UIController with canvas rendering, zoom, pan, and box interactions"
```

---

### Task 8: App Entry Point — Wire Everything Together

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Write js/app.js to wire all modules**

```js
import ImageLoader from './image-loader.js';
import BackgroundDetector from './bg-detector.js';
import ElementSlicer from './element-slicer.js';
import UIController from './ui-controller.js';

const loader = new ImageLoader();
const detector = new BackgroundDetector();
const slicer = new ElementSlicer();

const canvas = document.getElementById('preview-canvas');
const ui = new UIController(canvas);

// State
let bgColor = { r: 0, g: 255, b: 0 };
let nextElementId = 1;
let debounceTimer = null;

// --- File Loading ---

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadImage(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadImage(file);
});

async function loadImage(file) {
  const result = await loader.loadFile(file);
  dropZone.classList.add('hidden');
  canvas.classList.add('active');
  document.getElementById('canvas-controls').classList.add('active');

  // Auto-detect background color
  bgColor = detector.detect(result.imageData);
  updateBgColorUI();

  // Fit image and process
  ui.fitToView(result.width, result.height);
  processImage();
}

// --- Background Color ---

const bgSwatch = document.getElementById('bg-color-swatch');
const bgPicker = document.getElementById('bg-color-picker');
const bgEyedropper = document.getElementById('bg-eyedropper-btn');

function updateBgColorUI() {
  const hex = detector.toHex(bgColor);
  bgSwatch.style.background = hex;
  bgPicker.value = hex;
}

bgPicker.addEventListener('input', (e) => {
  bgColor = detector.fromHex(e.target.value);
  updateBgColorUI();
  debounceProcess();
});

bgEyedropper.addEventListener('click', () => {
  ui.eyedropperMode = !ui.eyedropperMode;
  bgEyedropper.classList.toggle('active', ui.eyedropperMode);
});

ui.onEyedrop = (x, y) => {
  const color = loader.getPixelColor(x, y);
  if (color) {
    bgColor = { r: color[0], g: color[1], b: color[2] };
    updateBgColorUI();
    ui.eyedropperMode = false;
    bgEyedropper.classList.remove('active');
    debounceProcess();
  }
};

// --- Mode Toggle ---

const modeGradient = document.getElementById('mode-gradient');
const modeThreshold = document.getElementById('mode-threshold');
const gradientParams = document.getElementById('gradient-params');
const thresholdParams = document.getElementById('threshold-params');

modeGradient.addEventListener('click', () => {
  modeGradient.classList.add('active');
  modeThreshold.classList.remove('active');
  gradientParams.style.display = '';
  thresholdParams.style.display = 'none';
  debounceProcess();
});

modeThreshold.addEventListener('click', () => {
  modeThreshold.classList.add('active');
  modeGradient.classList.remove('active');
  thresholdParams.style.display = '';
  gradientParams.style.display = 'none';
  debounceProcess();
});

// --- Sliders ---

function bindSlider(id, displayId, suffix = '') {
  const slider = document.getElementById(id);
  const display = document.getElementById(displayId);
  slider.addEventListener('input', () => {
    display.textContent = slider.value + suffix;
    debounceProcess();
  });
}

bindSlider('inner-threshold', 'inner-val');
bindSlider('outer-threshold', 'outer-val');
bindSlider('gradient-aa-dist', 'gradient-aa-val');
bindSlider('threshold-value', 'thresh-val');
bindSlider('thresh-aa-dist', 'thresh-aa-val');
bindSlider('min-element-size', 'min-size-val');
bindSlider('overlap-distance', 'overlap-dist-val');
bindSlider('export-padding', 'padding-val');

// --- Processing Pipeline ---

function getParams() {
  const isGradient = modeGradient.classList.contains('active');
  return {
    mode: isGradient ? 'gradient' : 'threshold',
    innerThreshold: +document.getElementById('inner-threshold').value,
    outerThreshold: +document.getElementById('outer-threshold').value,
    threshold: +document.getElementById('threshold-value').value,
    antiAliasDist: isGradient
      ? +document.getElementById('gradient-aa-dist').value
      : +document.getElementById('thresh-aa-dist').value,
  };
}

function processImage() {
  const sourceData = loader.getOriginalData();
  if (!sourceData) return;

  const params = getParams();
  const minSize = +document.getElementById('min-element-size').value;
  const overlapDist = +document.getElementById('overlap-distance').value;

  // Remove background
  const processed = slicer.removeBackground(sourceData, bgColor, params);
  ui.processedData = processed;

  // Find elements
  const elements = slicer.findElements(processed, minSize);
  nextElementId = elements.length > 0 ? Math.max(...elements.map((e) => e.id)) + 1 : 1;
  ui.elements = elements;

  // Detect overlaps
  ui.overlaps = slicer.detectOverlaps(elements, overlapDist);

  // Check all elements by default
  ui.checkedIds = new Set(elements.map((e) => e.id));

  // Render
  ui.render();
  updateElementList();
  updateExportButtons();
}

function debounceProcess() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(processImage, 150);
}

// --- Element List ---

function updateElementList() {
  const list = document.getElementById('element-list');
  const count = document.getElementById('element-count');
  count.textContent = ui.elements.length;

  list.innerHTML = '';
  const overlapIds = new Set();
  for (const [a, b] of ui.overlaps) {
    overlapIds.add(a);
    overlapIds.add(b);
  }

  for (const el of ui.elements) {
    const item = document.createElement('div');
    item.className = 'element-item';
    if (el.id === ui.selectedElementId) item.classList.add('selected');
    if (overlapIds.has(el.id)) item.classList.add('overlap');

    const name = el.name || `element_${String(el.id).padStart(3, '0')}`;

    // Thumbnail
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'thumb';
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 32;
    thumbCanvas.height = 32;
    renderThumbnail(thumbCanvas, el);
    thumbDiv.appendChild(thumbCanvas);

    item.innerHTML = `
      <input type="checkbox" ${ui.checkedIds.has(el.id) ? 'checked' : ''} data-id="${el.id}" />
    `;
    item.appendChild(thumbDiv);
    item.innerHTML += `
      <div class="name"><input type="text" value="${name}" data-id="${el.id}" /></div>
      <button class="download-btn" data-id="${el.id}" title="下載">⬇</button>
    `;

    // Click to select
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      ui.selectedElementId = el.id;
      ui.render();
      updateElementList();
    });

    // Context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, el);
    });

    list.appendChild(item);
  }

  // Bind checkbox events
  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const id = +e.target.dataset.id;
      if (e.target.checked) {
        ui.checkedIds.add(id);
      } else {
        ui.checkedIds.delete(id);
      }
      updateExportButtons();
    });
  });

  // Bind name input events
  list.querySelectorAll('input[type="text"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const id = +e.target.dataset.id;
      const el = ui.elements.find((el) => el.id === id);
      if (el) {
        el.name = e.target.value;
        ui.render();
      }
    });
  });

  // Bind download buttons
  list.querySelectorAll('.download-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = +e.target.dataset.id;
      const el = ui.elements.find((el) => el.id === id);
      if (el) downloadElement(el);
    });
  });
}

function renderThumbnail(thumbCanvas, el) {
  if (!ui.processedData) return;
  const tctx = thumbCanvas.getContext('2d');
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = ui.processedData.width;
  srcCanvas.height = ui.processedData.height;
  srcCanvas.getContext('2d').putImageData(ui.processedData, 0, 0);

  // Scale to fit 32x32
  const scale = Math.min(32 / el.w, 32 / el.h);
  const dw = el.w * scale;
  const dh = el.h * scale;
  const dx = (32 - dw) / 2;
  const dy = (32 - dh) / 2;
  tctx.drawImage(srcCanvas, el.x, el.y, el.w, el.h, dx, dy, dw, dh);
}

// --- Context Menu ---

let activeContextMenu = null;

function showContextMenu(x, y, el) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const deleteItem = document.createElement('div');
  deleteItem.className = 'context-menu-item';
  deleteItem.textContent = '刪除';
  deleteItem.addEventListener('click', () => {
    ui.elements = ui.elements.filter((e) => e.id !== el.id);
    ui.checkedIds.delete(el.id);
    ui.overlaps = ui.overlaps.filter(([a, b]) => a !== el.id && b !== el.id);
    if (ui.selectedElementId === el.id) ui.selectedElementId = null;
    ui.render();
    updateElementList();
    updateExportButtons();
    removeContextMenu();
  });
  menu.appendChild(deleteItem);

  // Check if this element has overlap partners to merge with
  const partners = ui.overlaps
    .filter(([a, b]) => a === el.id || b === el.id)
    .map(([a, b]) => (a === el.id ? b : a));

  for (const partnerId of partners) {
    const mergeItem = document.createElement('div');
    mergeItem.className = 'context-menu-item';
    const partnerEl = ui.elements.find((e) => e.id === partnerId);
    const partnerName = partnerEl?.name || `element_${String(partnerId).padStart(3, '0')}`;
    mergeItem.textContent = `合併 ${partnerName}`;
    mergeItem.addEventListener('click', () => {
      ui.elements = slicer.mergeElements(ui.elements, el.id, partnerId);
      ui.overlaps = slicer.detectOverlaps(ui.elements, +document.getElementById('overlap-distance').value);
      ui.render();
      updateElementList();
      removeContextMenu();
    });
    menu.appendChild(mergeItem);
  }

  document.body.appendChild(menu);
  activeContextMenu = menu;

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', removeContextMenu, { once: true });
  }, 0);
}

function removeContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

// --- New Box from Canvas ---

ui.onNewBox = ({ x, y, w, h }) => {
  const newEl = { id: nextElementId++, x, y, w, h, pixelCount: 0 };
  ui.elements.push(newEl);
  ui.checkedIds.add(newEl.id);
  ui.overlaps = slicer.detectOverlaps(ui.elements, +document.getElementById('overlap-distance').value);
  ui.selectedElementId = newEl.id;
  ui.render();
  updateElementList();
  updateExportButtons();
};

ui.onElementSelect = (id) => {
  updateElementList();
};

ui.onElementsChanged = () => {
  updateElementList();
};

// --- Export ---

function updateExportButtons() {
  document.getElementById('export-selected').disabled = ui.checkedIds.size === 0;
  document.getElementById('export-all').disabled = ui.elements.length === 0;
}

function getElementCanvas(el) {
  const padding = +document.getElementById('export-padding').value;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = el.w + padding * 2;
  outCanvas.height = el.h + padding * 2;
  const outCtx = outCanvas.getContext('2d');

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = ui.processedData.width;
  srcCanvas.height = ui.processedData.height;
  srcCanvas.getContext('2d').putImageData(ui.processedData, 0, 0);

  outCtx.drawImage(srcCanvas, el.x, el.y, el.w, el.h, padding, padding, el.w, el.h);
  return outCanvas;
}

function downloadElement(el) {
  const outCanvas = getElementCanvas(el);
  outCanvas.toBlob((blob) => {
    const name = el.name || `element_${String(el.id).padStart(3, '0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

document.getElementById('export-selected').addEventListener('click', async () => {
  const selected = ui.elements.filter((e) => ui.checkedIds.has(e.id));
  if (selected.length === 1) {
    downloadElement(selected[0]);
    return;
  }
  await exportAsZip(selected);
});

document.getElementById('export-all').addEventListener('click', async () => {
  if (ui.elements.length === 1) {
    downloadElement(ui.elements[0]);
    return;
  }
  await exportAsZip(ui.elements);
});

async function exportAsZip(elements) {
  const zip = new JSZip();
  const promises = elements.map((el) => {
    return new Promise((resolve) => {
      const outCanvas = getElementCanvas(el);
      outCanvas.toBlob((blob) => {
        const name = el.name || `element_${String(el.id).padStart(3, '0')}`;
        zip.file(`${name}.png`, blob);
        resolve();
      }, 'image/png');
    });
  });

  await Promise.all(promises);
  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = 'elements.zip';
  a.click();
  URL.revokeObjectURL(a.href);
}
```

- [ ] **Step 2: Verify full workflow in browser**

Open `http://localhost:3000` in browser:
1. Drag a test image from `test-file/` onto the drop zone
2. Verify: background color auto-detected, image displayed with checkerboard transparency
3. Verify: bounding boxes appear around detected elements
4. Verify: right panel shows element list with thumbnails
5. Adjust sliders and verify real-time update
6. Click an element to select it, drag to move
7. Shift+drag on empty space to create a new box
8. Right-click an element to see delete/merge options
9. Click export buttons to download PNGs

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: wire all modules together — complete working app"
```

---

### Task 9: Polish & Edge Cases

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`

- [ ] **Step 1: Add window resize handling to app.js**

Add at the end of `js/app.js`:

```js
// --- Window Resize ---
window.addEventListener('resize', () => {
  if (ui.processedData) ui.render();
});
```

- [ ] **Step 2: Add loading state for large images**

Add after the `loadImage` function definition in `js/app.js`, and update the function:

In the `loadImage` function, wrap the processing in a visual indicator. Add to `css/style.css`:

```css
/* === Loading State === */
#canvas-area.loading::after {
  content: '處理中...';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 16px;
  z-index: 10;
}
```

Modify `loadImage` in `js/app.js` to add/remove loading class:

```js
async function loadImage(file) {
  const canvasArea = document.getElementById('canvas-area');
  canvasArea.classList.add('loading');

  // Use setTimeout to let the UI update before heavy processing
  await new Promise((r) => setTimeout(r, 50));

  const result = await loader.loadFile(file);
  dropZone.classList.add('hidden');
  canvas.classList.add('active');
  document.getElementById('canvas-controls').classList.add('active');

  bgColor = detector.detect(result.imageData);
  updateBgColorUI();
  ui.fitToView(result.width, result.height);
  processImage();

  canvasArea.classList.remove('loading');
}
```

- [ ] **Step 3: Support re-loading a new image (reset state)**

Add to `loadImage` before processing, reset previous state:

```js
  // Reset state
  ui.elements = [];
  ui.overlaps = [];
  ui.selectedElementId = null;
  ui.checkedIds = new Set();
  nextElementId = 1;
```

- [ ] **Step 4: Verify in browser, commit**

Test: load one image, then drag a different image. Verify state resets properly.

```bash
git add js/app.js css/style.css
git commit -m "feat: add resize handling, loading state, and image reload support"
```

---

### Task 10: Final Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Test with first test image**

Open app, drag `test-file/generated-image-166e67ab-470e-40bd-9574-765ea2d5acd9.png`.

Verify:
- Green background is auto-detected
- Elements are detected and bounded
- Sliders adjust processing in real-time
- Export produces valid transparent PNGs

- [ ] **Step 2: Test with second test image**

Drag `test-file/generated-image-c944be06-81d9-413c-8ff9-3e0d33aa9dd8.png`.

Verify same behavior.

- [ ] **Step 3: Test edge cases**

- Zoom in/out with scroll wheel
- Pan by dragging
- Shift+drag to create a new box
- Right-click to delete/merge elements
- Rename elements in the list
- Export single element (direct download) vs multiple (ZIP)
- Switch between gradient and threshold modes
- Adjust anti-alias distance

- [ ] **Step 4: Final commit if any fixes were made**

```bash
git add -A
git commit -m "fix: integration test fixes"
```
