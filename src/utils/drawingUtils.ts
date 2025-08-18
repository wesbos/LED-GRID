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

// 5x7 bitmap font optimized for LED displays
const BITMAP_FONT: Record<string, number[][]> = {
  'A': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,0,0,0,0]
  ],
  'B': [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [0,0,0,0,0]
  ],
  'C': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  'D': [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [0,0,0,0,0]
  ],
  'E': [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
    [0,0,0,0,0]
  ],
  'F': [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [0,0,0,0,0]
  ],
  'G': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,0],
    [1,0,1,1,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  'H': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,0,0,0,0]
  ],
  'I': [
    [0,1,1,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  'J': [
    [0,0,0,0,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  'K': [
    [1,0,0,0,1],
    [1,0,0,1,0],
    [1,0,1,0,0],
    [1,1,0,0,0],
    [1,0,1,0,0],
    [1,0,0,1,0],
    [1,0,0,0,1]
  ],
  'L': [
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
    [0,0,0,0,0]
  ],
  'M': [
    [1,0,0,0,1],
    [1,1,0,1,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,0,0,0,0]
  ],
  'N': [
    [1,0,0,0,1],
    [1,1,0,0,1],
    [1,0,1,0,1],
    [1,0,0,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,0,0,0,0]
  ],
  'O': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  'P': [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [0,0,0,0,0]
  ],
  'Q': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,0,0,1,1],
    [0,1,1,1,1],
    [0,0,0,0,0]
  ],
  'R': [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,1,0,0],
    [1,0,0,1,0],
    [1,0,0,0,1],
    [0,0,0,0,0]
  ],
  'S': [
    [0,1,1,1,1],
    [1,0,0,0,0],
    [0,1,1,1,0],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,0],
    [0,0,0,0,0]
  ],
  'T': [
    [1,1,1,1,1],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0]
  ],
  'U': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  'V': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,0,0,0,0]
  ],
  'W': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,1,0,1,1],
    [1,0,0,0,1],
    [0,0,0,0,0]
  ],
  'X': [
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,1,0,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,0,0,0,0]
  ],
  'Y': [
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0]
  ],
  'Z': [
    [1,1,1,1,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,1,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
    [0,0,0,0,0]
  ],
  '0': [
    [0,1,1,1,0],
    [1,0,0,1,1],
    [1,0,1,0,1],
    [1,1,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  '1': [
    [0,0,1,0,0],
    [0,1,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  '2': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,1,0,0,0],
    [1,1,1,1,1],
    [0,0,0,0,0]
  ],
  '3': [
    [1,1,1,1,0],
    [0,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,0],
    [0,0,0,0,0]
  ],
  '4': [
    [1,0,0,1,0],
    [1,0,0,1,0],
    [1,1,1,1,1],
    [0,0,0,1,0],
    [0,0,0,1,0],
    [0,0,0,1,0],
    [0,0,0,0,0]
  ],
  '5': [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,0],
    [0,0,0,0,0]
  ],
  '6': [
    [0,1,1,1,0],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  '7': [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,1,0,0,0],
    [0,1,0,0,0],
    [0,0,0,0,0]
  ],
  '8': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  '9': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,1],
    [0,0,0,0,1],
    [0,1,1,1,0],
    [0,0,0,0,0]
  ],
  ' ': [
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0]
  ],
  '!': [
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0]
  ],
  '?': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0]
  ],
  '.': [
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0]
  ],
  ',': [
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,1,0,0,0],
    [0,0,0,0,0]
  ],
  ':': [
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0]
  ],
  '-': [
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [1,1,1,1,1],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0]
  ],
  '+': [
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [1,1,1,1,1],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0]
  ]
};

// Calculate optimal text layout for the grid
function calculateTextLayout(text: string): {
  charWidth: number;
  charHeight: number;
  spacing: number;
  scale: number;
  startX: number;
  startY: number;
} {
  const baseCharWidth = 5;
  const baseCharHeight = 7;
  const baseSpacing = 1;

  // Calculate how much space we need
  const totalBaseWidth = (text.length * baseCharWidth) + ((text.length - 1) * baseSpacing);
  const totalBaseHeight = baseCharHeight;

  // Calculate maximum scale that fits
  const maxScaleX = Math.floor(GRID_WIDTH / totalBaseWidth);
  const maxScaleY = Math.floor(GRID_HEIGHT / totalBaseHeight);
  const scale = Math.max(1, Math.min(maxScaleX, maxScaleY, 4)); // Cap at 4x for readability

  const scaledWidth = totalBaseWidth * scale;
  const scaledHeight = totalBaseHeight * scale;

  return {
    charWidth: baseCharWidth * scale,
    charHeight: baseCharHeight * scale,
    spacing: baseSpacing * scale,
    scale,
    startX: Math.floor((GRID_WIDTH - scaledWidth) / 2),
    startY: Math.floor((GRID_HEIGHT - scaledHeight) / 2)
  };
}

// Function to draw text using bitmap font
export const drawText = async (text: string, color: string, socket: WebSocket) => {
  const upperText = text.toUpperCase();
  const layout = calculateTextLayout(upperText);

  console.log(`Drawing "${text}" with layout:`, layout);

  const pixels: { x: number; y: number }[] = [];

  // Draw each character
  for (let charIndex = 0; charIndex < upperText.length; charIndex++) {
    const char = upperText[charIndex];
    const charBitmap = BITMAP_FONT[char];

    if (!charBitmap) {
      console.warn(`Character "${char}" not found in bitmap font, skipping`);
      continue;
    }

    // Calculate character position
    const charX = layout.startX + (charIndex * (layout.charWidth + layout.spacing));
    const charY = layout.startY;

    // Draw the character bitmap
    for (let row = 0; row < charBitmap.length; row++) {
      for (let col = 0; col < charBitmap[row].length; col++) {
        if (charBitmap[row][col] === 1) {
          // Scale the pixel
          for (let scaleY = 0; scaleY < layout.scale; scaleY++) {
            for (let scaleX = 0; scaleX < layout.scale; scaleX++) {
              const pixelX = charX + (col * layout.scale) + scaleX;
              const pixelY = charY + (row * layout.scale) + scaleY;

              // Bounds check
              if (pixelX >= 0 && pixelX < GRID_WIDTH && pixelY >= 0 && pixelY < GRID_HEIGHT) {
                pixels.push({ x: pixelX, y: pixelY });
              }
            }
          }
        }
      }
    }
  }

  console.log(`Rendering ${pixels.length} pixels for "${text}"`);

  // Send all pixels
  pixels.forEach(({ x, y }) => {
    socket.send(JSON.stringify({
      type: 'draw',
      x,
      y,
      color
    }));
  });
};
