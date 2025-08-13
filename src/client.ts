import "./styles.css";
import throttle from "lodash/throttle";
import PartySocket from "partysocket";
import { GRID_SIZE, TOTAL_CELLS } from "./constants";

const PARTYKIT_HOST: string = `${window.location.origin}/party`;

// Set grid size CSS variable
document.documentElement.style.setProperty('--grid-size', GRID_SIZE.toString());

// Function to sample image and draw to grid
const drawImageToGrid = async (file: File) => {
  const img = new Image();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  img.onload = () => {
    // Set canvas size to match our grid
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;

    // Draw and scale image to fit our grid size
    ctx.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);

    const pixelsWithColors: { index: number, color: string }[] = [];
    // Sample each pixel and collect coordinates with colors
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const color = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
        const index = y * GRID_SIZE + x;
        pixelsWithColors.push({ index, color });
      }
    }

    // Draw all pixels
    pixelsWithColors.forEach(({ index, color }) => {
      socket.send(JSON.stringify({
        type: 'draw',
        x: index % GRID_SIZE,
        y: Math.floor(index / GRID_SIZE),
        color
      }));
    });

  };

  img.src = URL.createObjectURL(file);
};

// Add drag and drop handlers
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
  document.body.classList.add('drag-active');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  // Only remove class if we're leaving the document
  if (!e.relatedTarget) {
    document.body.classList.remove('drag-active');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  document.body.classList.remove('drag-active');

  const file = e.dataTransfer?.files[0];
  if (file?.type.startsWith('image/')) {
    drawImageToGrid(file);
  }
});

// Get room ID from the URL path
const getRoomId = () => {
  let room = window.location.pathname;
  if (room.startsWith("/")) room = room.slice(1);
  if (room.endsWith("/")) room = room.slice(0, -1);
  return room.replaceAll("/", "-") || "default";
};

// Initialize PartySocket connection
const room = getRoomId();
console.log("room", room);
console.log(`PARTYKIT_HOST: ${PARTYKIT_HOST}`);
const socket = new PartySocket({
  host: PARTYKIT_HOST,
  party: 'grid-server',
  room,
});

// Create the grid
const grid = document.querySelector('.grid')!;
const colorPicker = document.querySelector('#colorPicker') as HTMLInputElement;
const presetButtons = document.querySelectorAll('.preset-btn');
const clearButton = document.getElementById('clearButton') as HTMLButtonElement | null;
const gridState: { color: string | undefined }[] = Array(TOTAL_CELLS).fill(null).map(() => ({ color: undefined }));

let isDrawing = false;
let currentColor: string | undefined = colorPicker.value;

// Create grid cells
const createGrid = () => {
  grid.innerHTML = ''; // Clear existing cells
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.index = i.toString();
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Cell ${i}`);
    grid.appendChild(cell);
  }
};

// Initialize the grid
createGrid();

// Update grid size CSS variable
document.documentElement.style.setProperty('--grid-size', GRID_SIZE.toString());

// Color handling
// Update active state of preset buttons
const updateActivePreset = (color: string | undefined) => {
  presetButtons.forEach(btn => {
    const btnElement = btn as HTMLElement;
    if (btnElement.dataset.color === color) {
      btnElement.classList.add('active');
    } else {
      btnElement.classList.remove('active');
    }
  });
};

// Handle color picker changes
colorPicker.addEventListener('input', (e) => {
  currentColor = (e.target as HTMLInputElement).value;
  updateActivePreset(currentColor);
});

// Handle preset button clicks
presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const btnElement = btn as HTMLElement;
    if (btnElement.classList.contains('eraser')) {
      clearGrid();
    } else {
      currentColor = btnElement.dataset.color!;
      colorPicker.value = currentColor;
    }
    updateActivePreset(currentColor);
  });
});

// Audio removed

// Drawing functions
const drawCell = (index: number, color: string | undefined) => {
  socket.send(JSON.stringify({
    type: 'draw',
    x: index % GRID_SIZE,
    y: Math.floor(index / GRID_SIZE),
    color
  }));
};

const clearGrid = () => {
  socket.send(JSON.stringify({
    type: 'clear'
  }));
};

// Wire Clear button
clearButton?.addEventListener('click', () => {
  clearGrid();
});



const drawBatchOfCells = (pixels: number[], color: string) => {
  pixels.forEach(index => {
    socket.send(JSON.stringify({
      type: 'draw',
      x: index % GRID_SIZE,
      y: Math.floor(index / GRID_SIZE),
      color
    }));
  });
};

// Handle drawing with pointer events
const handleDrawEvent = (e: PointerEvent) => {
  if (!isDrawing) return;

  const cell = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
  if (!cell?.classList.contains('cell')) return;

  const index = parseInt(cell.dataset.index!);
  if (isNaN(index)) return;

  drawCell(index, currentColor);
};

// Pointer event handlers
grid.addEventListener('pointerdown', ((e: Event) => {
  const pointerEvent = e as PointerEvent;
  isDrawing = true;
  // Capture the pointer to get events outside the element
  const target = pointerEvent.target as HTMLElement;
  target.setPointerCapture(pointerEvent.pointerId);
  handleDrawEvent(pointerEvent);
}) as EventListener);

grid.addEventListener('pointermove', ((e: Event) => {
  handleDrawEvent(e as PointerEvent);
}) as EventListener);

const stopDrawing = () => {
  isDrawing = false;
};

grid.addEventListener('pointerup', stopDrawing);
grid.addEventListener('pointerleave', stopDrawing);
grid.addEventListener('pointercancel', stopDrawing);

// Remove touch-action to prevent scrolling while drawing
(grid as HTMLElement).style.touchAction = 'none';

// Font data - Simple 5x7 pixel font representation
const FONT_DATA = {
  A: [
    [0,1,1,0,0],
    [1,0,0,1,0],
    [1,1,1,1,0],
    [1,0,0,1,0],
    [1,0,0,1,0],
  ],
  // Add more letters as needed
};

// Function to draw text
const drawText = async (text: string, color: string) => {
  // Clear any existing timeouts and expired state

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = GRID_SIZE;
  canvas.height = GRID_SIZE;

  // Adjust font size based on text length
  const fontSize = Math.min(48, Math.floor(GRID_SIZE / text.length) * 1.5);
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Center text
  ctx.fillText(text, GRID_SIZE/2, GRID_SIZE/2);

  const pixels: number[] = [];

  // Collect all pixels that need to be drawn
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[3] > 0) {
        const index = y * GRID_SIZE + x;
        pixels.push(index);
      }
    }
  }

  // Draw all pixels as one batch
  drawBatchOfCells(pixels, color);
};

// Handle text form submission
const textForm = document.getElementById('textForm') as HTMLFormElement;
const textInput = document.getElementById('textInput') as HTMLInputElement;

textForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (text) {
    drawText(text, currentColor || '#ffffff');
    textInput.value = '';
  }
});

// Handle incoming messages
socket.addEventListener("message", (event) => {
  // Handle special string messages first
  if (typeof event.data === 'string') {
    if (event.data === 'slowdown') {
      console.log('Drawing too fast, please slow down');
      return;
    }
    if (event.data === 'goaway') {
      console.log('Connection closed by server');
      socket.close();
      return;
    }
  }

  try {
    const data = JSON.parse(event.data);
    if (data.type === 'gridUpdate') {
      // Update single cell
      const cell = grid.children[data.index] as HTMLElement;
      const color = data.color ?? null;
      cell.style.setProperty('--color', color);
      gridState[data.index] = { color: color ?? undefined };
    } else if (data.type === 'fullState') {
      // Update entire grid
      data.state.forEach((cellData: { color: string | undefined } | null, index: number) => {
        const element = grid.children[index] as HTMLElement;
        const color = cellData?.color ?? null;
        element.style.setProperty('--color', color);
        gridState[index] = { color: color ?? undefined };
      });
    } else if (data.type === 'userCount') {
      // Update user count display
      const userCountElement = document.getElementById('userCount');
      if (userCountElement) {
        userCountElement.textContent = data.count.toString();
      }
    }
  } catch (err) {
    console.error('Failed to parse message:', err);
  }
});
