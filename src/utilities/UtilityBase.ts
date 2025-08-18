import type { GridCell } from '../types';
import { GRID_WIDTH, GRID_HEIGHT, TOTAL_CELLS } from '../constants';

export interface UtilityConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  refreshIntervalMs?: number; // Auto-refresh interval, if desired
}

export interface UtilityResult {
  success: boolean;
  gridData?: GridCell[];
  error?: string;
  metadata?: Record<string, unknown>;
}

export abstract class UtilityBase {
  public readonly config: UtilityConfig;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(config: UtilityConfig) {
    this.config = config;
  }

  // Abstract method that each utility must implement
  abstract fetchData(): Promise<UtilityResult>;

  // Helper to create an empty grid
  protected createEmptyGrid(): GridCell[] {
    return new Array(TOTAL_CELLS).fill(null).map(() => ({ color: undefined }));
  }

  // Helper to convert RGB to hex
  protected rgbToHex(r: number, g: number, b: number): string {
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    return [clamp(r), clamp(g), clamp(b)]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  // Helper to set a pixel at x,y coordinates
  protected setPixel(grid: GridCell[], x: number, y: number, color: string): void {
    if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
      const index = y * GRID_WIDTH + x;
      grid[index] = { color };
    }
  }

  // Helper to draw a rectangle
  protected drawRect(grid: GridCell[], x: number, y: number, width: number, height: number, color: string): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        this.setPixel(grid, x + dx, y + dy, color);
      }
    }
  }

  // Helper to draw text using bitmap font
  protected drawText(grid: GridCell[], text: string, x: number, y: number, color: string, scale = 1): void {
    const upperText = text.toUpperCase();

    for (let charIndex = 0; charIndex < upperText.length; charIndex++) {
      const char = upperText[charIndex];
      const charBitmap = this.getBitmapChar(char);

      if (!charBitmap) continue;

      // Calculate character position
      const charX = x + (charIndex * (5 * scale + scale)); // 5 width + 1 spacing, scaled
      const charY = y;

      // Draw the character bitmap
      for (let row = 0; row < charBitmap.length; row++) {
        for (let col = 0; col < charBitmap[row].length; col++) {
          if (charBitmap[row][col] === 1) {
            // Scale the pixel
            for (let scaleY = 0; scaleY < scale; scaleY++) {
              for (let scaleX = 0; scaleX < scale; scaleX++) {
                const pixelX = charX + (col * scale) + scaleX;
                const pixelY = charY + (row * scale) + scaleY;
                this.setPixel(grid, pixelX, pixelY, color);
              }
            }
          }
        }
      }
    }
  }

  // Simple bitmap font (subset for utilities)
  private getBitmapChar(char: string): number[][] | null {
    const font: Record<string, number[][]> = {
      'A': [[0,1,1,1,0],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1]],
      'B': [[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0]],
      'C': [[0,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[0,1,1,1,0]],
      'D': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
      'E': [[1,1,1,1,1],[1,0,0,0,0],[1,1,1,0,0],[1,0,0,0,0],[1,1,1,1,1]],
      'F': [[1,1,1,1,1],[1,0,0,0,0],[1,1,1,0,0],[1,0,0,0,0],[1,0,0,0,0]],
      'G': [[0,1,1,1,0],[1,0,0,0,0],[1,0,1,1,1],[1,0,0,0,1],[0,1,1,1,0]],
      'H': [[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1]],
      'I': [[0,1,1,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
      'L': [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
      'O': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
      'S': [[0,1,1,1,1],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[1,1,1,1,0]],
      'T': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
      'U': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
      'R': [[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,1]],
      'N': [[1,0,0,0,1],[1,1,0,0,1],[1,0,1,0,1],[1,0,0,1,1],[1,0,0,0,1]],
      'M': [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
      'V': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0]],
      'W': [[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
      'Y': [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
      'K': [[1,0,0,1,0],[1,0,1,0,0],[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0]],
      ' ': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
      '0': [[0,1,1,1,0],[1,0,0,1,1],[1,0,1,0,1],[1,1,0,0,1],[0,1,1,1,0]],
      '1': [[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
      '2': [[0,1,1,1,0],[1,0,0,0,1],[0,0,1,0,0],[0,1,0,0,0],[1,1,1,1,1]],
      '3': [[1,1,1,1,0],[0,0,0,0,1],[0,1,1,1,0],[0,0,0,0,1],[1,1,1,1,0]],
      '4': [[1,0,0,1,0],[1,0,0,1,0],[1,1,1,1,1],[0,0,0,1,0],[0,0,0,1,0]],
      '5': [[1,1,1,1,1],[1,0,0,0,0],[1,1,1,1,0],[0,0,0,0,1],[1,1,1,1,0]],
      '6': [[0,1,1,1,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,1],[0,1,1,1,0]],
      '7': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0]],
      '8': [[0,1,1,1,0],[1,0,0,0,1],[0,1,1,1,0],[1,0,0,0,1],[0,1,1,1,0]],
      '9': [[0,1,1,1,0],[1,0,0,0,1],[0,1,1,1,1],[0,0,0,0,1],[0,1,1,1,0]]
    };

    return font[char] || null;
  }

  // Start auto-refresh if configured
  public startAutoRefresh(onUpdate: (result: UtilityResult) => void): void {
    if (!this.config.refreshIntervalMs) return;

    this.refreshTimer = setInterval(async () => {
      try {
        const result = await this.fetchData();
        onUpdate(result);
      } catch (error) {
        onUpdate({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.config.refreshIntervalMs);
  }

  // Stop auto-refresh
  public stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Execute the utility and return grid data
  public async execute(): Promise<UtilityResult> {
    try {
      return await this.fetchData();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
