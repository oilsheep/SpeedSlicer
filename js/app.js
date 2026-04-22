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
  const canvasArea = document.getElementById('canvas-area');
  canvasArea.classList.add('loading');

  // Reset state
  ui.elements = [];
  ui.overlaps = [];
  ui.selectedElementId = null;
  ui.checkedIds = new Set();
  nextElementId = 1;

  // Let UI update before heavy processing
  await new Promise((r) => setTimeout(r, 50));

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

  canvasArea.classList.remove('loading');
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

  const processed = slicer.removeBackground(sourceData, bgColor, params);
  ui.processedData = processed;

  const elements = slicer.findElements(processed, minSize);
  nextElementId = elements.length > 0 ? Math.max(...elements.map((e) => e.id)) + 1 : 1;
  ui.elements = elements;

  ui.overlaps = slicer.detectOverlaps(elements, overlapDist);
  ui.checkedIds = new Set(elements.map((e) => e.id));

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

    // Build all elements via DOM API to avoid innerHTML destroying the canvas
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = ui.checkedIds.has(el.id);
    checkbox.dataset.id = el.id;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = name;
    nameInput.dataset.id = el.id;
    nameDiv.appendChild(nameInput);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.dataset.id = el.id;
    downloadBtn.title = '下載';
    downloadBtn.textContent = '⬇';

    item.appendChild(checkbox);
    item.appendChild(thumbDiv);
    item.appendChild(nameDiv);
    item.appendChild(downloadBtn);

    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      ui.selectedElementId = el.id;
      ui.render();
      updateElementList();
    });

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

// --- Window Resize ---
window.addEventListener('resize', () => {
  if (ui.processedData) ui.render();
});
