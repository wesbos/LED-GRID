import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

// Function to sample image and draw to grid
export const drawImageToGrid = async (file: File, socket: WebSocket) => {
  const img = new Image();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  return new Promise<void>((resolve, reject) => {
    img.onload = () => {
      // Set canvas size to match our grid
      canvas.width = GRID_WIDTH;
      canvas.height = GRID_HEIGHT;

      // Draw and scale image to fit our grid size
      ctx.drawImage(img, 0, 0, GRID_WIDTH, GRID_HEIGHT);

      const pixelsWithColors: { index: number, color: string }[] = [];
      // Sample each pixel and collect coordinates with colors
      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          const color = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
          const index = y * GRID_WIDTH + x;
          pixelsWithColors.push({ index, color });
        }
      }

      // Draw all pixels
      pixelsWithColors.forEach(({ index, color }) => {
        const x = index % GRID_WIDTH;
        const y = Math.floor(index / GRID_WIDTH);

        socket.send(JSON.stringify({
          type: 'draw',
          x,
          y,
          color
        }));
      });

      resolve();
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
};

// Function to draw text
export const drawText = async (text: string, color: string, socket: WebSocket) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = GRID_WIDTH;
  canvas.height = GRID_HEIGHT;

  // Adjust font size based on text length
  const minDim = Math.min(GRID_WIDTH, GRID_HEIGHT);
  const fontSize = Math.min(48, Math.floor(minDim / Math.max(1, text.length)) * 1.5);
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Center text
  ctx.fillText(text, GRID_WIDTH/2, GRID_HEIGHT/2);

  const pixels: number[] = [];

  // Collect all pixels that need to be drawn
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[3] > 0) {
        const index = y * GRID_WIDTH + x;
        pixels.push(index);
      }
    }
  }

  // Draw all pixels as one batch
  pixels.forEach(index => {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);

    socket.send(JSON.stringify({
      type: 'draw',
      x,
      y,
      color
    }));
  });
};
