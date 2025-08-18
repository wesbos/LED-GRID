import { WorkerEntrypoint } from "cloudflare:workers";
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

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

function byteLengthUtf8(input: string): number {
  try {
    return new TextEncoder().encode(input).length;
  } catch {
    // Fallback approximation
    return input.length;
  }
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

  public readonly useWebSocket: boolean;
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

    this.useWebSocket = options.useWebSocket ?? false;
    this.webSocketPath = options.webSocketPath ?? "/ws";

    // Log chosen transport at startup
    try {
      const hasWS = typeof (globalThis as any).WebSocket !== 'undefined';
      if (this.useWebSocket && hasWS) {
        console.log(`[USING WEBSOCKET]`, this.buildWebSocketUrl());
      } else {
        console.log(`[USING HTTP]`, `${this.baseUrl}/json`);
      }
    } catch (_) {
      // ignore logging errors
    }
  }

  async setRangeColor(startIndexInclusive: number, stopIndexExclusive: number, color: HexColor | Rgb): Promise<void> {
    const start = Math.max(0, Math.min(startIndexInclusive, this.gridWidth * this.gridHeight));
    const stop = Math.max(start, Math.min(stopIndexExclusive, this.gridWidth * this.gridHeight));
    const hex = normalizeHex(color);
    const body: any = {
      on: this.powerOnOnWrite,
      seg: [{ id: this.segmentId, i: [start, stop, hex] }],
      v: false,
    };
    const payload = JSON.stringify(body);
    const willUseWS = await this.ensureWebSocket();
    if (willUseWS) {
      this.sendOverWebSocket(payload);
      return;
    }
    const url = `${this.baseUrl}/json`;
    await postJson(url, body);
  }

  async clearAll(): Promise<void> {
    const total = this.gridWidth * this.gridHeight;
    return this.setRangeColor(0, total, "000000");
  }


  async sendPixels(pixels: Array<PixelUpdate>, opts?: FlushOptions): Promise<void> {
    if (!pixels.length) return;
    const powerOn = opts?.powerOn ?? this.powerOnOnWrite;

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
      // Verbose response
      // v: true
    };
    if (ttUnits != null) bodyData.tt = ttUnits;

    // Determine transport and its size limit
    const pixelCountTotal = iArray.length / 2;
    const forceHttpForLargeBatch = pixelCountTotal > 300;
    const willUseWS = forceHttpForLargeBatch ? false : await this.ensureWebSocket();
    const WEBSOCKET_LIMIT = 1400;
    // It seems 2000 is a good limit
    const HTTP_LIMIT = 5000;
    const HTTP_WAIT_MS = 2;
    const limit = willUseWS ? WEBSOCKET_LIMIT : HTTP_LIMIT;

    // Chunk the i-array so each JSON payload stays under the limit
    let startIndex = 0;
    let chunkNumber = 1;
    const totalPairs = iArray.length / 2;
    while (startIndex < iArray.length) {
      let endIndex = startIndex;
      let lastGoodEnd = startIndex;
      let lastGoodPayload = '';
      let lastGoodBytes = 0;
      while (endIndex < iArray.length) {
        // grow by one pair [index, hex]
        endIndex += 2;
        const iSub = iArray.slice(startIndex, endIndex);
        const bodySub: any = {
          on: powerOn,
          seg: [{ id: this.segmentId, i: iSub }],
          v: false,
        };
        if (ttUnits != null) bodySub.tt = ttUnits;
        const payloadStrSub = JSON.stringify(bodySub);
        const bytes = byteLengthUtf8(payloadStrSub);
        if (bytes <= limit) {
          lastGoodEnd = endIndex;
          lastGoodPayload = payloadStrSub;
          lastGoodBytes = bytes;
        } else {
          break;
        }
      }

      // Ensure we always make progress
      if (lastGoodEnd === startIndex) {
        // force at least one pair per chunk
        const iSub = iArray.slice(startIndex, startIndex + 2);
        const bodySub: any = {
          on: powerOn,
          seg: [{ id: this.segmentId, i: iSub }],
          v: false,
        };
        if (ttUnits != null) bodySub.tt = ttUnits;
        lastGoodPayload = JSON.stringify(bodySub);
        lastGoodBytes = byteLengthUtf8(lastGoodPayload);
        lastGoodEnd = startIndex + 2;
      }

      const pixelsInChunk = (lastGoodEnd - startIndex) / 2;
      const modeLabel = willUseWS ? '[ws]' : '[http]';
      console.log(`[WLED] ${modeLabel} chunk`, chunkNumber, ` ${lastGoodBytes} bytes`, `${pixelsInChunk} pixels`);

      if (willUseWS) {
        this.sendOverWebSocket(lastGoodPayload);
        // Wait a bit to avoid overwhelming the server. Delay increases with chunk number
        await new Promise((resolve) => setTimeout(resolve, chunkNumber * 20));
      } else {
        const url = `${this.baseUrl}/json`;
        const start = Date.now();
        const response = await postJson(url, JSON.parse(lastGoodPayload));
        // add a 100ms delay to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, HTTP_WAIT_MS));
        if (!response.ok) {
          console.error(`[WLED] HTTP chunk failed`, response.status, response.statusText);
        }
        console.log('WLED HTTP chunk sent in', Math.round(Date.now() - start), 'ms');
      }

      startIndex = lastGoodEnd;
      chunkNumber += 1;
    }

  }

  private buildWebSocketUrl(): string {
    const u = new URL(this.webSocketPath, this.baseUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  }

  private async ensureWebSocket(): Promise<boolean> {
    if (!this.useWebSocket) return false;
    if (!WebSocket) return false;
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
        const ws = new WebSocket(wsUrl);
        this.ws = ws;
        ws.onopen = () => {
          console.log(`[WS] OPENED`);
          this.wsOpen = true;
          // Flush any queued messages
          for (const msg of this.wsMessageQueue) {
            try { ws.send(msg); } catch {}
          }
          this.wsMessageQueue = [];
          resolve();
        };
        ws.onmessage = (event: MessageEvent) => {
          const data = event.data;
          if (typeof data === 'string' && data.startsWith('{"error"')) {
            console.error(`[WS] MESSAGE ERROR`, data);
          } else {
            // console.log(`[WS] MESSAGE`, data);
          }
        };
        ws.onclose = () => {
          console.log(`[WS] CLOSED`);
          this.wsOpen = false;
          this.wsReadyPromise = null;
        };
        ws.onerror = (err: unknown) => {
          console.log(`[WS] ERROR`, err);
          this.wsOpen = false;
          this.wsReadyPromise = null;
          reject(new Error('WebSocket error'));
        };
      } catch (err) {
        console.log(`[WS] ERROR crea`, err);
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

export const wled = new WledGridClient({
  baseUrl,
  gridWidth: GRID_WIDTH,
  gridHeight: GRID_HEIGHT,
  serpentine: false,
  orientation: 'top-left',
  defaultTransitionMs: 0,
  includeVerboseResponse: false,
  useWebSocket: true,
});


export default WledGridClient;
