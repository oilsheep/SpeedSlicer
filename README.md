# SpeedSlicer

**Instantly extract every UI element from a sprite sheet. Drop an image, get transparent PNGs.**

No installation. No server. Just open `index.html` and start slicing.

---

### Input
![Input sprite sheet](samples/input.png)

### SpeedSlicer at work
![SpeedSlicer screenshot](samples/screenshot.png)

### Output
81 individual transparent PNGs, exported in one click. ([Download sample output](samples/output-elements.zip))

---

## Why SpeedSlicer?

Game artists and developers constantly deal with sprite sheets — dozens of UI elements packed onto a single colored background. Manually cutting each one in Photoshop is tedious and slow.

**SpeedSlicer automates the entire process:**

1. **Drop** your sprite sheet
2. **Background is removed** automatically using professional HSV chroma keying
3. **Every element is detected** and individually boxed
4. **Export** all elements as transparent PNGs in a single ZIP

What used to take 30+ minutes now takes seconds.

## Key Features

| Feature | Description |
|---------|-------------|
| **Auto background detection** | Samples corner pixels to find the key color |
| **HSV chroma keying** | Targets hue precisely — whites, grays, and darks stay intact |
| **Despill** | Removes color bleeding from edges (no more green fringing) |
| **Pixel-mask export** | Overlapping bounding boxes? Each PNG only contains its own pixels |
| **Shift+click multi-select** | Photoshop-style selection for batch merge or delete |
| **Ctrl+Z undo** | Up to 50 steps |
| **i18n** | Auto-detects language: English, 繁體中文, 简体中文, 日本語, 한국어 |
| **Save/Load config** | Export your settings as JSON, reuse across sessions |
| **Zero dependencies** | Pure HTML/JS/CSS. No npm, no build, no server |

## How to Use

**Open** `index.html` in Chrome, Edge, or Firefox.

**Load image** — drag & drop or click "Load Image" in the top bar.

**Adjust if needed** — tweak the right panel sliders:
- *Hue Inner/Outer* — how aggressively to key the background
- *Saturation/Value Guard* — protect whites and darks from being keyed
- *Despill Strength* — remove edge color contamination
- *Min Element Size* — filter out noise

**Edit elements** — on the canvas:
- Click to select, Shift+click for multi-select
- Drag to move, corner handles to resize
- `+` button or Shift+drag on empty space to add a box
- Delete key to remove selected elements
- Merge button to combine selected elements

**Export** — click the export button. Get a ZIP containing:
- `_full_transparent.png` — the entire image with background removed
- Individual PNGs for every detected element

## Tech Stack

Pure frontend. No build tools. No frameworks.

- Canvas 2D API for pixel processing
- Connected Component Labeling for element detection
- JSZip for client-side ZIP generation

## License

MIT
