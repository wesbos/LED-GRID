import { WorkerEntrypoint } from "cloudflare:workers";
import { GRID_SIZE } from '../constants';

export type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type HexColor = string; // e.g. "#FF00AA" or "FF00AA"

export type PixelUpdate = {
  index: number; // 0-based LED index in the segment
  color: HexColor | Rgb;
};

export type Orientation =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type WledGridOptions = {
  baseUrl: string; // e.g. "http://wled-grid.local"
  segmentId?: number; // default 0

  // 2D mapping options
  gridWidth: number; // number of columns
  gridHeight: number; // number of rows
  serpentine?: boolean; // true if every other row is reversed; default false
  orientation?: Orientation; // default "top-left"

  // HTTP behavior
  requestTimeoutMs?: number; // default 4000
  defaultTransitionMs?: number; // optional transition applied to flush; default 0
  powerOnOnWrite?: boolean; // default true - ensure device is on when writing
  includeVerboseResponse?: boolean; // sets `v: true` to request state response; default false
  // WebSocket behavior
  useWebSocket?: boolean; // if true, send updates over ws://[base]/ws when available; default false
  webSocketPath?: string; // path of websocket endpoint; default "/ws"
};

export type FlushOptions = {
  transitionMs?: number;
  powerOn?: boolean;
  verboseResponse?: boolean;
};

export type BrightnessOptions = {
  transitionMs?: number;
  powerOn?: boolean;
  verboseResponse?: boolean;
};

function normalizeHex(color: HexColor | Rgb): string {
  if (typeof color === "string") {
    const trimmed = color.startsWith("#") ? color.slice(1) : color;
    if (!/^([0-9a-fA-F]{6})$/.test(trimmed)) {
      throw new Error(`Invalid hex color: ${color}`);
    }
    return trimmed.toUpperCase();
  }
  const { r, g, b } = color;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return [clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function msToTtUnits(transitionMs: number | undefined): number | undefined {
  // WLED `tt` is in 100ms units
  if (transitionMs == null) return undefined;
  return Math.max(0, Math.round(transitionMs / 100));
}

function computeIndex(
  x: number,
  y: number,
  width: number,
  height: number,
  serpentine: boolean,
  orientation: Orientation
): number {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    throw new Error(`XY out of range: (${x}, ${y}) for ${width}x${height}`);
  }

  // Normalize orientation to top-left row-major coordinates first
  let nx = x;
  let ny = y;
  switch (orientation) {
    case "top-left":
      // as-is
      break;
    case "top-right":
      nx = width - 1 - x;
      ny = y;
      break;
    case "bottom-left":
      nx = x;
      ny = height - 1 - y;
      break;
    case "bottom-right":
      nx = width - 1 - x;
      ny = height - 1 - y;
      break;
  }

  if (serpentine && ny % 2 === 1) {
    nx = width - 1 - nx;
  }
  return ny * width + nx;
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
}

export class WledGridClient {
  private readonly baseUrl: string;
  private readonly segmentId: number;
  private readonly gridWidth: number;
  private readonly gridHeight: number;
  private readonly serpentine: boolean;
  private readonly orientation: Orientation;
  private readonly requestTimeoutMs: number;
  private readonly defaultTransitionMs?: number;
  private readonly powerOnOnWrite: boolean;
  private readonly includeVerboseResponse: boolean;
  private readonly useWebSocket: boolean;
  private readonly webSocketPath: string;

  // WebSocket connection (optional, controlled by options)
  private ws: any | null = null;
  private wsOpen = false;
  private wsReadyPromise: Promise<void> | null = null;
  private wsMessageQueue: string[] = [];

  // Flushing logic removed; this library only sends immediate calls

  constructor(options: WledGridOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.segmentId = options.segmentId ?? 0;
    this.gridWidth = options.gridWidth;
    this.gridHeight = options.gridHeight;
    this.serpentine = options.serpentine ?? false;
    this.orientation = options.orientation ?? "top-left";
    this.requestTimeoutMs = options.requestTimeoutMs ?? 4000;
    this.defaultTransitionMs = options.defaultTransitionMs;
    this.powerOnOnWrite = options.powerOnOnWrite ?? true;
    this.includeVerboseResponse = options.includeVerboseResponse ?? false;
    this.useWebSocket = options.useWebSocket ?? false;
    this.webSocketPath = options.webSocketPath ?? "/ws";
  }

  // Brightness 1..255 (WLED uses 1..255, 0 is allowed but better use on:false)
  async setBrightness(
    brightness: number,
    opts?: BrightnessOptions
  ): Promise<any | void> {
    const bri = Math.max(0, Math.min(255, Math.round(brightness)));
    const body: any = {
      on: opts?.powerOn ?? this.powerOnOnWrite,
      bri,
    };

    const ttUnits = msToTtUnits(opts?.transitionMs);
    if (ttUnits != null) body.tt = ttUnits;
    if (opts?.verboseResponse ?? this.includeVerboseResponse) body.v = true;

    const url = `${this.baseUrl}/json/state`;
    const response = await postJson(url, body);
    if (!response.ok) {
      throw new Error(`WLED brightness update failed: ${response.status} ${response.statusText}`);
    }
    if (opts?.verboseResponse ?? this.includeVerboseResponse) {
      return response.json();
    }
  }

  // Flushing and queuing removed. Use sendPixels / sendPixelIndex / sendPixelXY instead.
  async sendPixelXY(x: number, y: number, color: HexColor | Rgb, opts?: FlushOptions): Promise<void> {
    const index = computeIndex(x, y, this.gridWidth, this.gridHeight, this.serpentine, this.orientation);
    return this.sendPixelIndex(index, color, opts);
  }

  async sendPixelIndex(index: number, color: HexColor | Rgb, opts?: FlushOptions): Promise<void> {
    return this.sendPixels([{ index, color }], opts);
  }

  async sendPixels(pixels: Array<PixelUpdate>, opts?: FlushOptions): Promise<void> {
    if (!pixels.length) return;
    const powerOn = opts?.powerOn ?? this.powerOnOnWrite;
    const verbose = opts?.verboseResponse ?? this.includeVerboseResponse;
    const ttUnits = msToTtUnits(opts?.transitionMs ?? this.defaultTransitionMs);

    const iArray: Array<number | string> = [];
    for (const { index, color } of pixels) {
      if (!Number.isInteger(index) || index < 0 || index >= this.gridWidth * this.gridHeight) continue;
      iArray.push(index, normalizeHex(color));
    }
    if (iArray.length === 0) return;

    const seg: any = { id: this.segmentId, i: iArray };
    const bodyData: any = {
      on: powerOn,
      seg: [seg],
    };
    if (ttUnits != null) bodyData.tt = ttUnits;
    if (verbose) bodyData.v = true;

    // Prefer WebSocket if enabled and available per https://kno.wled.ge/interfaces/websocket/
    if (await this.ensureWebSocket()) {
      const payload = JSON.stringify(bodyData);
      this.sendOverWebSocket(payload);
      return;
    }

    // Fallback to HTTP POST
    const url = `${this.baseUrl}/json`;
    const start = Date.now();
    await postJson(url, bodyData);
    console.log('WLED HTTP sent in', Date.now() - start, 'ms');

  }

  private buildWebSocketUrl(): string {
    const u = new URL(this.webSocketPath, this.baseUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  }

  private async ensureWebSocket(): Promise<boolean> {
    if (!this.useWebSocket) return false;
    const WS: any = (globalThis as any).WebSocket;
    if (!WS) return false;
    if (this.ws && this.wsOpen) return true;
    if (this.wsReadyPromise) {
      try {
        await this.wsReadyPromise;
        return this.wsOpen;
      } catch {
        return false;
      }
    }

    this.wsReadyPromise = new Promise<void>((resolve, reject) => {
      try {
        const wsUrl = this.buildWebSocketUrl();
        const ws = new WS(wsUrl);
        this.ws = ws;
        ws.onopen = () => {
          this.wsOpen = true;
          // Optionally request full state if verbose is generally desired
          if (this.includeVerboseResponse) {
            try { ws.send(JSON.stringify({ v: true })); } catch {}
          }
          // Flush any queued messages
          for (const msg of this.wsMessageQueue) {
            try { ws.send(msg); } catch {}
          }
          this.wsMessageQueue = [];
          resolve();
        };
        ws.onclose = () => {
          this.wsOpen = false;
          this.wsReadyPromise = null;
        };
        ws.onerror = () => {
          this.wsOpen = false;
          this.wsReadyPromise = null;
          reject(new Error('WebSocket error'));
        };
      } catch (err) {
        this.wsOpen = false;
        this.wsReadyPromise = null;
        reject(err as any);
      }
    });

    try {
      await this.wsReadyPromise;
      return this.wsOpen;
    } catch {
      return false;
    }
  }

  private sendOverWebSocket(message: string): void {
    if (!this.ws || !this.wsOpen) {
      this.wsMessageQueue.push(message);
      return;
    }
    try {
      this.ws.send(message);
    } catch {
      this.wsMessageQueue.push(message);
    }
  }
}

// We cannot use the mdns address as it was causing the
// websockets to queue when a fetch request was made.
// const baseUrl = 'http://wled-grid.local';

// Using the IP address of the hardware is fine
const baseUrl = 'http://192.168.1.100';

// const baseUrl = 'https://local.wesbos.com/';

export const wled = new WledGridClient({
  baseUrl,
  gridWidth: GRID_SIZE,
  gridHeight: GRID_SIZE,
  serpentine: false,
  orientation: 'top-left',
  defaultTransitionMs: 0,
  includeVerboseResponse: false,
  useWebSocket: true,
});


function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default WledGridClient;
