export default class ImageLoader {
  constructor() {
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    this.imageData = null;
    this.width = 0;
    this.height = 0;
    this.originalImage = null;
  }

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

  getOriginalData() {
    if (!this.originalImage) return null;
    this._ctx.drawImage(this.originalImage, 0, 0);
    return this._ctx.getImageData(0, 0, this.width, this.height);
  }

  getPixelColor(x, y) {
    if (!this.imageData) return null;
    const i = (y * this.width + x) * 4;
    const d = this.imageData.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }
}
