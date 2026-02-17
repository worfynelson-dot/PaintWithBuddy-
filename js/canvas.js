// ===== CANVAS PAINTING ENGINE =====

class PaintCanvas {
  constructor(canvasId, socket) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;

    this.isDrawing = false;
    this.currentTool = 'brush';
    this.brushSize = 5;
    this.brushColor = '#000000';
    this.brushOpacity = 1.0;
    this.lastX = 0;
    this.lastY = 0;
    this.strokeId = null;
    this.drawerId = null;

    this.drawBuffer = [];
    this.bufferInterval = null;

    this.setupCanvas();
    this.setupEvents();
    this.startBufferFlush();
  }

  setupCanvas() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const wrapper = this.canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();

    // Save current canvas content
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Fill white background
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Restore content if sizes match (approximately)
    try {
      this.ctx.putImageData(imageData, 0, 0);
    } catch (e) {
      // sizes differ, redraw from history
    }
  }

  setupEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDraw(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.endDraw());
    this.canvas.addEventListener('mouseleave', () => this.endDraw());

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.startDraw(touch);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.draw(touch);
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.endDraw();
    });

    // Cursor position broadcast
    this.canvas.addEventListener('mousemove', (e) => {
      const pos = this.getPos(e);
      this.socket.emit('cursor-move', { x: pos.x, y: pos.y });
    });
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top)
    };
  }

  startDraw(e) {
    this.isDrawing = true;
    const pos = this.getPos(e);
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.strokeId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    if (this.currentTool === 'fill') {
      this.floodFill(Math.round(pos.x), Math.round(pos.y), this.brushColor);
      this.isDrawing = false;
      return;
    }

    // Draw single dot
    this.drawStroke(pos.x, pos.y, pos.x, pos.y);
    this.sendDrawData(pos.x, pos.y, pos.x, pos.y);
  }

  draw(e) {
    if (!this.isDrawing) return;
    if (this.currentTool === 'fill') return;

    const pos = this.getPos(e);
    this.drawStroke(this.lastX, this.lastY, pos.x, pos.y);
    this.sendDrawData(this.lastX, this.lastY, pos.x, pos.y);
    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  endDraw() {
    if (this.isDrawing) {
      this.flushBuffer();
    }
    this.isDrawing = false;
  }

  drawStroke(x1, y1, x2, y2, tool, size, color, opacity) {
    tool = tool || this.currentTool;
    size = size || this.brushSize;
    color = color || this.brushColor;
    opacity = opacity !== undefined ? opacity : this.brushOpacity;

    this.ctx.save();
    this.ctx.globalAlpha = opacity;

    switch (tool) {
      case 'brush':
        this.drawBrush(x1, y1, x2, y2, size, color);
        break;
      case 'pencil':
        this.drawPencil(x1, y1, x2, y2, size, color);
        break;
      case 'marker':
        this.drawMarker(x1, y1, x2, y2, size, color);
        break;
      case 'spray':
        this.drawSpray(x2, y2, size, color);
        break;
      case 'watercolor':
        this.drawWatercolor(x1, y1, x2, y2, size, color, opacity);
        break;
      case 'crayon':
        this.drawCrayon(x1, y1, x2, y2, size, color);
        break;
      case 'calligraphy':
        this.drawCalligraphy(x1, y1, x2, y2, size, color);
        break;
      case 'eraser':
        this.drawEraser(x1, y1, x2, y2, size);
        break;
      default:
        this.drawBrush(x1, y1, x2, y2, size, color);
    }

    this.ctx.restore();
  }

  drawBrush(x1, y1, x2, y2, size, color) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawPencil(x1, y1, x2, y2, size, color) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(1, size * 0.4);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Add slight texture
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.floor(dist / 2));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * size * 0.2;
      const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * size * 0.2;
      this.ctx.fillStyle = color;
      this.ctx.globalAlpha = 0.3;
      this.ctx.fillRect(px, py, 1, 1);
    }
  }

  drawMarker(x1, y1, x2, y2, size, color) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size * 1.8;
    this.ctx.lineCap = 'square';
    this.ctx.lineJoin = 'bevel';
    this.ctx.globalAlpha *= 0.6;
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawSpray(x, y, size, color) {
    const density = size * 3;
    const radius = size * 2;
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      this.ctx.fillStyle = color;
      this.ctx.globalAlpha = Math.random() * 0.3 + 0.1;
      this.ctx.fillRect(px, py, Math.random() * 2 + 0.5, Math.random() * 2 + 0.5);
    }
  }

  drawWatercolor(x1, y1, x2, y2, size, color, opacity) {
    const layers = 3;
    for (let l = 0; l < layers; l++) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = size * (1.5 + l * 0.5);
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.globalAlpha = (opacity || 0.5) * 0.15;
      const offsetX = (Math.random() - 0.5) * size * 0.3;
      const offsetY = (Math.random() - 0.5) * size * 0.3;
      this.ctx.moveTo(x1 + offsetX, y1 + offsetY);
      this.ctx.lineTo(x2 + offsetX, y2 + offsetY);
      this.ctx.stroke();
    }
  }

  drawCrayon(x1, y1, x2, y2, size, color) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Add crayon texture (random gaps)
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.floor(dist));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      if (Math.random() > 0.5) {
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = Math.random() * 0.4 + 0.2;
        const dotSize = Math.random() * size * 0.5;
        this.ctx.fillRect(
          px + (Math.random() - 0.5) * size,
          py + (Math.random() - 0.5) * size,
          dotSize, dotSize
        );
      }
    }
  }

  drawCalligraphy(x1, y1, x2, y2, size, color) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const width = size * Math.abs(Math.sin(angle)) + size * 0.3;

    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(1, width);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawEraser(x1, y1, x2, y2, size) {
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    this.ctx.lineWidth = size * 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.globalCompositeOperation = 'source-over';
  }

  floodFill(startX, startY, fillColor) {
    const dpr = window.devicePixelRatio;
    const px = Math.round(startX * dpr);
    const py = Math.round(startY * dpr);
    const w = this.canvas.width;
    const h = this.canvas.height;

    const imageData = this.ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const targetIdx = (py * w + px) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];
    const targetA = data[targetIdx + 3];

    // Parse fill color
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1;
    tempCanvas.height = 1;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = fillColor;
    tempCtx.fillRect(0, 0, 1, 1);
    const fillData = tempCtx.getImageData(0, 0, 1, 1).data;
    const fillR = fillData[0];
    const fillG = fillData[1];
    const fillB = fillData[2];

    // Don't fill if same color
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === 255) return;

    const tolerance = 30;
    const stack = [[px, py]];
    const visited = new Uint8Array(w * h);

    function matchesTarget(idx) {
      return Math.abs(data[idx] - targetR) <= tolerance &&
             Math.abs(data[idx + 1] - targetG) <= tolerance &&
             Math.abs(data[idx + 2] - targetB) <= tolerance &&
             Math.abs(data[idx + 3] - targetA) <= tolerance;
    }

    let iterations = 0;
    const maxIterations = w * h;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const [cx, cy] = stack.pop();
      const idx = cy * w + cx;

      if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
      if (visited[idx]) continue;

      const pIdx = idx * 4;
      if (!matchesTarget(pIdx)) continue;

      visited[idx] = 1;
      data[pIdx] = fillR;
      data[pIdx + 1] = fillG;
      data[pIdx + 2] = fillB;
      data[pIdx + 3] = 255;

      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }

    this.ctx.putImageData(imageData, 0, 0);

    // Send fill action
    this.socket.emit('draw', {
      type: 'fill',
      x: startX,
      y: startY,
      color: fillColor,
      strokeId: this.strokeId,
      drawerId: this.drawerId
    });
  }

  sendDrawData(x1, y1, x2, y2) {
    const data = {
      type: 'stroke',
      x1, y1, x2, y2,
      tool: this.currentTool,
      size: this.brushSize,
      color: this.brushColor,
      opacity: this.brushOpacity,
      strokeId: this.strokeId,
      drawerId: this.drawerId
    };
    this.drawBuffer.push(data);
  }

  startBufferFlush() {
    this.bufferInterval = setInterval(() => {
      this.flushBuffer();
    }, 30); // ~33fps network sync
  }

  flushBuffer() {
    if (this.drawBuffer.length > 0) {
      this.socket.emit('draw-batch', this.drawBuffer);
      this.drawBuffer = [];
    }
  }

  receiveDrawBatch(dataArray) {
    dataArray.forEach(data => {
      if (data.type === 'fill') {
        this.floodFill(data.x, data.y, data.color);
      } else {
        this.drawStroke(data.x1, data.y1, data.x2, data.y2, data.tool, data.size, data.color, data.opacity);
      }
    });
  }

  receiveDraw(data) {
    if (data.type === 'fill') {
      this.floodFill(data.x, data.y, data.color);
    } else {
      this.drawStroke(data.x1, data.y1, data.x2, data.y2, data.tool, data.size, data.color, data.opacity);
    }
  }

  loadHistory(history) {
    this.clearCanvas(false);
    history.forEach(data => {
      if (data.type === 'fill') {
        this.floodFill(data.x, data.y, data.color);
      } else {
        this.drawStroke(data.x1, data.y1, data.x2, data.y2, data.tool, data.size, data.color, data.opacity);
      }
    });
  }

  clearCanvas(emit = true) {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    if (emit) {
      this.socket.emit('clear-canvas');
    }
  }

  saveCanvas() {
    const link = document.createElement('a');
    link.download = `PaintWithBuddy_${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }

  setTool(tool) {
    this.currentTool = tool;
  }

  setSize(size) {
    this.brushSize = size;
  }

  setColor(color) {
    this.brushColor = color;
  }

  setOpacity(opacity) {
    this.brushOpacity = opacity;
  }

  destroy() {
    if (this.bufferInterval) {
      clearInterval(this.bufferInterval);
    }
  }
}