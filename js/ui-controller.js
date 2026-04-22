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
    this.originalImage = null;
    this.processedData = null;
    this.elements = [];
    this.overlaps = [];
    this.selectedIds = new Set(); // multi-select
    this.elementMap = null; // Int32Array pixel→elementId map

    // Interaction state
    this.eyedropperMode = false;
    this.addBoxMode = false;
    this.drawingBox = null;
    this.draggingElement = null;
    this.resizingElement = null;

    // Checkerboard pattern (cached)
    this._checkerPattern = null;

    this._setupCanvasEvents();
  }

  _setupCanvasEvents() {
    const area = this.canvas.parentElement;

    area.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, this.zoom * delta));

      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
      this.panY = my - (my - this.panY) * (newZoom / this.zoom);

      this.zoom = newZoom;
      this.render();
      this._updateZoomDisplay();
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

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

    if (this.eyedropperMode) {
      if (this.onEyedrop) this.onEyedrop(imgPos.x, imgPos.y);
      return;
    }

    const handle = this._hitTestHandle(imgPos.x, imgPos.y);
    if (handle) {
      if (this.onBeforeDrag) this.onBeforeDrag();
      this.resizingElement = handle;
      const cls = (handle.handle === 'nw' || handle.handle === 'se') ? 'cursor-nwse' : 'cursor-nesw';
      this.canvas.classList.add(cls);
      return;
    }

    const hitEl = this._hitTestElement(imgPos.x, imgPos.y);
    if (hitEl) {
      if (e.button === 0) {
        if (e.shiftKey) {
          // Shift+click: toggle in multi-select
          if (this.selectedIds.has(hitEl.id)) {
            this.selectedIds.delete(hitEl.id);
          } else {
            this.selectedIds.add(hitEl.id);
          }
          if (this.onElementSelect) this.onElementSelect();
          this.render();
        } else {
          // Normal click: select only this, start drag
          if (this.onBeforeDrag) this.onBeforeDrag();
          this.selectedIds = new Set([hitEl.id]);
          this.draggingElement = {
            id: hitEl.id,
            offsetX: imgPos.x - hitEl.x,
            offsetY: imgPos.y - hitEl.y,
          };
          if (this.onElementSelect) this.onElementSelect();
          this.render();
        }
      }
      return;
    }

    if (this.addBoxMode || e.shiftKey) {
      this.drawingBox = {
        startX: imgPos.x, startY: imgPos.y,
        endX: imgPos.x, endY: imgPos.y,
      };
      return;
    }

    // Click on empty space without shift: deselect all
    if (!e.shiftKey && this.selectedIds.size > 0) {
      this.selectedIds = new Set();
      if (this.onElementSelect) this.onElementSelect();
      this.render();
    }

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

    // Update cursor based on hover position
    this._updateCursor(e);
  }

  _updateCursor(e) {
    const c = this.canvas;
    // Remove all cursor classes
    c.className = c.className.replace(/cursor-\S+/g, '').trim();
    if (this.processedData) c.classList.add('active');

    if (this.eyedropperMode) {
      c.classList.add('cursor-eyedropper');
      return;
    }
    if (this.addBoxMode) {
      c.classList.add('cursor-add-box');
      return;
    }

    const imgPos = this.screenToImage(e.clientX, e.clientY);

    // Check resize handles first
    const handle = this._hitTestHandle(imgPos.x, imgPos.y);
    if (handle) {
      if (handle.handle === 'nw' || handle.handle === 'se') {
        c.classList.add('cursor-nwse');
      } else {
        c.classList.add('cursor-nesw');
      }
      return;
    }

    // Check element hit for move cursor
    const hitEl = this._hitTestElement(imgPos.x, imgPos.y);
    if (hitEl) {
      c.classList.add('cursor-move');
      return;
    }

    // Default: grab for panning
    // (handled by base CSS rule)
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
      this.addBoxMode = false;
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
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (ix >= el.x && ix <= el.x + el.w && iy >= el.y && iy <= el.y + el.h) {
        return el;
      }
    }
    return null;
  }

  _hitTestHandle(ix, iy) {
    const handleSize = 6 / this.zoom;
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

    if (el.w < 5) el.w = 5;
    if (el.h < 5) el.h = 5;
  }

  _updateZoomDisplay() {
    const display = document.getElementById('zoom-level');
    if (display) display.textContent = `${Math.round(this.zoom * 100)}%`;
  }

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

    // Draw checkerboard background
    ctx.save();
    ctx.fillStyle = this._getCheckerPattern();
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Draw processed image
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    tmpCanvas.getContext('2d').putImageData(this.processedData, 0, 0);
    ctx.drawImage(tmpCanvas, 0, 0);

    // Draw element mask overlay: tint each element's pixels with a unique color
    if (this.elementMap && this.elements.length > 0) {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d');
      const maskData = maskCtx.createImageData(width, height);
      const md = maskData.data;

      // Assign a color per element ID
      const colors = [
        [79, 195, 247], [233, 69, 96], [76, 175, 80], [255, 183, 77],
        [186, 104, 200], [255, 138, 101], [77, 208, 225], [255, 213, 79],
        [129, 199, 132], [240, 98, 146], [100, 181, 246], [255, 167, 38],
      ];

      for (let i = 0; i < this.elementMap.length; i++) {
        const elId = this.elementMap[i];
        if (elId === 0) continue;
        const c = colors[(elId - 1) % colors.length];
        const pi = i * 4;
        const isSelected = this.selectedIds.has(elId);
        const alpha = isSelected ? 90 : 40;
        md[pi] = c[0]; md[pi + 1] = c[1]; md[pi + 2] = c[2]; md[pi + 3] = alpha;
      }

      maskCtx.putImageData(maskData, 0, 0);
      ctx.drawImage(maskCanvas, 0, 0);
    }

    // Draw element bounding boxes
    for (const el of this.elements) {
      const isSelected = this.selectedIds.has(el.id);

      ctx.strokeStyle = isSelected ? '#e94560' : '#4fc3f7';
      ctx.lineWidth = (isSelected ? 2 : 1) / this.zoom;
      ctx.setLineDash([]);
      ctx.strokeRect(el.x, el.y, el.w, el.h);

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
