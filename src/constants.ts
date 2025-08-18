// Grid dimensions
export const GRID_WIDTH = 16 * 3;
export const GRID_HEIGHT = 16 * 3;
export const TOTAL_CELLS = GRID_WIDTH * GRID_HEIGHT;

// WLED communication limits and thresholds
export const WLED_CONFIG = {
  // Pixel count threshold: above this, force HTTP instead of WebSocket
  LARGE_BATCH_PIXEL_THRESHOLD: 300,

  // Byte limits for different transports
  WEBSOCKET_BYTE_LIMIT: 1400,
  HTTP_BYTE_LIMIT: 5000,

  // Timing configuration
  HTTP_CHUNK_DELAY_MS: 2,
  WEBSOCKET_CHUNK_BASE_DELAY_MS: 20, // multiplied by chunk number

  // Retry configuration
  LED_UPDATE_RETRY_MS_WEBSOCKET: 1,
  LED_UPDATE_RETRY_MS_HTTP: 1000,
} as const;
