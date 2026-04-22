import ImageLoader from './image-loader.js';
import BackgroundDetector from './bg-detector.js';
import ElementSlicer from './element-slicer.js';
import UIController from './ui-controller.js';
import { languageNames, detectLanguage, t, setLanguage, applyTranslations } from './i18n.js';

const loader = new ImageLoader();
const detector = new BackgroundDetector();
const slicer = new ElementSlicer();

const canvas = document.getElementById('preview-canvas');
const ui = new UIController(canvas);

// --- Language Setup ---
const langSelect = document.getElementById('lang-select');
for (const [code, name] of Object.entries(languageNames)) {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = name;
  langSelect.appendChild(opt);
}
const initialLang = detectLanguage();
langSelect.value = initialLang;
setLanguage(initialLang);

langSelect.addEventListener('change', (e) => {
  setLanguage(e.target.value);
  // Re-render element list to update download titles
  updateElementList();
});

// State
let bgColor = { r: 0, g: 255, b: 0 };
let nextElementId = 1;
let debounceTimer = null;

// --- Undo System ---
const undoStack = [];
const MAX_UNDO = 50;

function saveUndoState() {
  undoStack.push({
    elements: ui.elements.map((e) => ({ ...e })),
    overlaps: ui.overlaps.map(([a, b]) => [a, b]),
    checkedIds: new Set(ui.checkedIds),
    selectedElementId: ui.selectedElementId,
    elementMap: ui.elementMap,
    nextElementId,
  });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0) return;
  const state = undoStack.pop();
  ui.elements = state.elements;
  ui.overlaps = state.overlaps;
  ui.checkedIds = state.checkedIds;
  ui.selectedElementId = state.selectedElementId;
  ui.elementMap = state.elementMap;
  nextElementId = state.nextElementId;
  ui.render();
  updateElementList();
  updateExportButtons();
  showUndoIndicator();
}

function showUndoIndicator() {
  let indicator = document.getElementById('undo-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'undo-indicator';
    document.body.appendChild(indicator);
  }
  indicator.textContent = t('undoMsg', { n: undoStack.length });
  indicator.classList.add('show');
  clearTimeout(indicator._timer);
  indicator._timer = setTimeout(() => indicator.classList.remove('show'), 1200);
}

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
  ui.elementMap = null;
  nextElementId = 1;
  undoStack.length = 0;

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
  document.getElementById('recalculate-btn').disabled = false;

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

bindSlider('inner-hue', 'inner-hue-val');
bindSlider('outer-hue', 'outer-hue-val');
bindSlider('sat-threshold', 'sat-thresh-val');
bindSlider('val-threshold', 'val-thresh-val');
bindSlider('despill-strength', 'despill-val');
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
    // HSV keying params
    innerHue: +document.getElementById('inner-hue').value,
    outerHue: +document.getElementById('outer-hue').value,
    satThreshold: +document.getElementById('sat-threshold').value / 100,
    valThreshold: +document.getElementById('val-threshold').value / 100,
    despillStrength: +document.getElementById('despill-strength').value / 100,
    // RGB threshold params
    threshold: +document.getElementById('threshold-value').value,
    // Shared
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

  const result = slicer.findElements(processed, minSize);
  const elements = result.elements;
  ui.elementMap = result.elementMap;

  nextElementId = elements.length > 0 ? Math.max(...elements.map((e) => e.id)) + 1 : 1;
  ui.elements = elements;

  // Detect overlapping bounding boxes (for visual indicator only, no auto-merge)
  ui.overlaps = slicer.detectOverlaps(elements, overlapDist);
  ui.checkedIds = new Set();

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

  for (const el of ui.elements) {
    const item = document.createElement('div');
    item.className = 'element-item';
    if (el.id === ui.selectedElementId) item.classList.add('selected');

    const name = el.name || `element_${String(el.id).padStart(3, '0')}`;

    // Thumbnail
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'thumb';
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 48;
    thumbCanvas.height = 48;
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
    downloadBtn.title = t('download');
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
  // Use getElementCanvas for accurate masked thumbnail
  const elCanvas = getElementCanvas(el);
  const tctx = thumbCanvas.getContext('2d');
  const scale = Math.min(48 / elCanvas.width, 48 / elCanvas.height);
  const dw = elCanvas.width * scale;
  const dh = elCanvas.height * scale;
  const dx = (48 - dw) / 2;
  const dy = (48 - dh) / 2;
  tctx.drawImage(elCanvas, 0, 0, elCanvas.width, elCanvas.height, dx, dy, dw, dh);
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
  deleteItem.textContent = t('deleteAction');
  deleteItem.addEventListener('click', () => {
    saveUndoState();
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
    mergeItem.textContent = `${t('mergeAction')} ${partnerName}`;
    mergeItem.addEventListener('click', () => {
      saveUndoState();
      const mergedId = Math.min(el.id, partnerId);
      const removedId = Math.max(el.id, partnerId);
      ui.elements = slicer.mergeElements(ui.elements, el.id, partnerId);
      // Update element map: reassign removed ID pixels to merged ID
      if (ui.elementMap) {
        for (let i = 0; i < ui.elementMap.length; i++) {
          if (ui.elementMap[i] === removedId) ui.elementMap[i] = mergedId;
        }
      }
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
  saveUndoState();
  const newEl = { id: nextElementId++, x, y, w, h, pixelCount: 0 };
  ui.elements.push(newEl);
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

// Save undo state before drag/resize starts
ui.onBeforeDrag = () => saveUndoState();

// --- Export ---

function updateExportButtons() {
  document.getElementById('export-selected').disabled = ui.checkedIds.size === 0;
  document.getElementById('export-all').disabled = ui.elements.length === 0;
  document.getElementById('merge-selected-btn').disabled = ui.checkedIds.size < 2;
  document.getElementById('delete-selected-btn').disabled =
    ui.checkedIds.size === 0 && ui.selectedElementId == null;
}

function getElementCanvas(el) {
  const padding = +document.getElementById('export-padding').value;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = el.w + padding * 2;
  outCanvas.height = el.h + padding * 2;
  const outCtx = outCanvas.getContext('2d');

  const { width } = ui.processedData;
  const srcData = ui.processedData.data;
  const elementMap = ui.elementMap;

  // Create masked ImageData: only include pixels belonging to this element
  const masked = outCtx.createImageData(el.w, el.h);
  const mData = masked.data;

  for (let dy = 0; dy < el.h; dy++) {
    for (let dx = 0; dx < el.w; dx++) {
      const sx = el.x + dx;
      const sy = el.y + dy;
      const srcIdx = sy * width + sx;
      const dstIdx = (dy * el.w + dx) * 4;
      const srcPx = srcIdx * 4;

      // Only copy pixels that belong to this element (or manually added boxes with no map)
      if (!elementMap || elementMap[srcIdx] === el.id || el.pixelCount === 0) {
        mData[dstIdx]     = srcData[srcPx];
        mData[dstIdx + 1] = srcData[srcPx + 1];
        mData[dstIdx + 2] = srcData[srcPx + 2];
        mData[dstIdx + 3] = srcData[srcPx + 3];
      }
      // else: leave as transparent (0,0,0,0)
    }
  }

  // Draw the masked data onto the output canvas with padding
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = el.w;
  tmpCanvas.height = el.h;
  tmpCanvas.getContext('2d').putImageData(masked, 0, 0);
  outCtx.drawImage(tmpCanvas, padding, padding);

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

// --- Recalculate Button ---

document.getElementById('recalculate-btn').addEventListener('click', () => {
  saveUndoState();
  processImage();
});

// Enable recalculate button when image is loaded
const _origProcessImage = processImage;

// --- Add / Delete Buttons ---

document.getElementById('add-box-btn').addEventListener('click', () => {
  ui.addBoxMode = true;
  ui.canvas.className = ui.canvas.className.replace(/cursor-\S+/g, '').trim();
  if (ui.processedData) ui.canvas.classList.add('active');
  ui.canvas.classList.add('cursor-add-box');
});

document.getElementById('delete-selected-btn').addEventListener('click', () => {
  // Delete checked elements, or the selected element if none checked
  let idsToDelete;
  if (ui.checkedIds.size > 0) {
    idsToDelete = [...ui.checkedIds];
  } else if (ui.selectedElementId != null) {
    idsToDelete = [ui.selectedElementId];
  } else {
    return;
  }

  saveUndoState();
  const deleteSet = new Set(idsToDelete);
  ui.elements = ui.elements.filter((e) => !deleteSet.has(e.id));
  for (const id of idsToDelete) ui.checkedIds.delete(id);
  ui.overlaps = ui.overlaps.filter(([a, b]) => !deleteSet.has(a) && !deleteSet.has(b));
  if (deleteSet.has(ui.selectedElementId)) ui.selectedElementId = null;
  ui.render();
  updateElementList();
  updateExportButtons();
});

// --- Merge Selected Elements ---

document.getElementById('merge-selected-btn').addEventListener('click', () => {
  if (ui.checkedIds.size < 2) return;
  saveUndoState();

  const ids = [...ui.checkedIds];
  const toMerge = ui.elements.filter((e) => ids.includes(e.id));
  if (toMerge.length < 2) return;

  // Compute merged bounding box
  const minX = Math.min(...toMerge.map((e) => e.x));
  const minY = Math.min(...toMerge.map((e) => e.y));
  const maxX = Math.max(...toMerge.map((e) => e.x + e.w));
  const maxY = Math.max(...toMerge.map((e) => e.y + e.h));
  const mergedId = Math.min(...ids);

  const merged = {
    id: mergedId,
    name: toMerge.find((e) => e.name)?.name,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    pixelCount: toMerge.reduce((s, e) => s + e.pixelCount, 0),
  };

  // Update elementMap: reassign all merged IDs to the merged ID
  if (ui.elementMap) {
    for (let i = 0; i < ui.elementMap.length; i++) {
      if (ids.includes(ui.elementMap[i])) {
        ui.elementMap[i] = mergedId;
      }
    }
  }

  // Replace elements
  ui.elements = ui.elements
    .filter((e) => !ids.includes(e.id))
    .concat(merged)
    .sort((a, b) => a.id - b.id);

  ui.checkedIds = new Set();
  ui.selectedElementId = mergedId;
  ui.overlaps = slicer.detectOverlaps(ui.elements, +document.getElementById('overlap-distance').value);
  ui.render();
  updateElementList();
  updateExportButtons();
});

// --- Keyboard Shortcuts ---

window.addEventListener('keydown', (e) => {
  // Ctrl+Z: Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
    return;
  }

  // Delete/Backspace: delete selected element
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (e.target.tagName === 'INPUT') return;
    // Delete checked, or selected if none checked
    let idsToDelete;
    if (ui.checkedIds.size > 0) {
      idsToDelete = [...ui.checkedIds];
    } else if (ui.selectedElementId != null) {
      idsToDelete = [ui.selectedElementId];
    } else {
      return;
    }
    saveUndoState();
    const deleteSet = new Set(idsToDelete);
    ui.elements = ui.elements.filter((el) => !deleteSet.has(el.id));
    for (const id of idsToDelete) ui.checkedIds.delete(id);
    ui.overlaps = ui.overlaps.filter(([a, b]) => !deleteSet.has(a) && !deleteSet.has(b));
    if (deleteSet.has(ui.selectedElementId)) ui.selectedElementId = null;
    ui.render();
    updateElementList();
    updateExportButtons();
    return;
  }

  // Escape: deselect / exit modes
  if (e.key === 'Escape') {
    ui.selectedElementId = null;
    ui.eyedropperMode = false;
    ui.addBoxMode = false;
    bgEyedropper.classList.remove('active');
    ui.render();
    updateElementList();
    return;
  }
});

// --- Config Save / Load ---

document.getElementById('save-config-btn').addEventListener('click', () => {
  const isGradient = modeGradient.classList.contains('active');
  const config = {
    version: 2,
    bgColor,
    mode: isGradient ? 'gradient' : 'threshold',
    innerHue: +document.getElementById('inner-hue').value,
    outerHue: +document.getElementById('outer-hue').value,
    satThreshold: +document.getElementById('sat-threshold').value,
    valThreshold: +document.getElementById('val-threshold').value,
    despillStrength: +document.getElementById('despill-strength').value,
    gradientAaDist: +document.getElementById('gradient-aa-dist').value,
    threshold: +document.getElementById('threshold-value').value,
    threshAaDist: +document.getElementById('thresh-aa-dist').value,
    minElementSize: +document.getElementById('min-element-size').value,
    overlapDistance: +document.getElementById('overlap-distance').value,
    exportPadding: +document.getElementById('export-padding').value,
  };

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'speedslicer-config.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('load-config-btn').addEventListener('click', () => {
  document.getElementById('config-file-input').click();
});

document.getElementById('config-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const config = JSON.parse(ev.target.result);
      applyConfig(config);
    } catch (err) {
      alert(t('configError'));
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset so same file can be loaded again
});

function applyConfig(config) {
  // Background color
  if (config.bgColor) {
    bgColor = config.bgColor;
    updateBgColorUI();
  }

  // Mode
  if (config.mode === 'gradient') {
    modeGradient.click();
  } else if (config.mode === 'threshold') {
    modeThreshold.click();
  }

  // Sliders
  function setSlider(id, displayId, value, suffix = '') {
    const slider = document.getElementById(id);
    const display = document.getElementById(displayId);
    if (slider && value != null) {
      slider.value = value;
      display.textContent = value + suffix;
    }
  }

  setSlider('inner-hue', 'inner-hue-val', config.innerHue);
  setSlider('outer-hue', 'outer-hue-val', config.outerHue);
  setSlider('sat-threshold', 'sat-thresh-val', config.satThreshold);
  setSlider('val-threshold', 'val-thresh-val', config.valThreshold);
  setSlider('despill-strength', 'despill-val', config.despillStrength);
  setSlider('gradient-aa-dist', 'gradient-aa-val', config.gradientAaDist);
  setSlider('threshold-value', 'thresh-val', config.threshold);
  setSlider('thresh-aa-dist', 'thresh-aa-val', config.threshAaDist);
  setSlider('min-element-size', 'min-size-val', config.minElementSize);
  setSlider('overlap-distance', 'overlap-dist-val', config.overlapDistance);
  setSlider('export-padding', 'padding-val', config.exportPadding);

  // Re-process if image is loaded
  if (loader.getOriginalData()) {
    processImage();
  }
}

// --- Load New Image ---

document.getElementById('load-new-image-btn').addEventListener('click', () => {
  fileInput.click();
});

// Also allow drag-and-drop on the entire canvas area even after an image is loaded
document.getElementById('canvas-area').addEventListener('dragover', (e) => {
  e.preventDefault();
});
document.getElementById('canvas-area').addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImage(file);
});

// --- Window Resize ---
window.addEventListener('resize', () => {
  if (ui.processedData) ui.render();
});
