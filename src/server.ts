// import type * as Party from "partykit/server";
import { routePartykitRequest, Server, type Connection, } from "partyserver";
import { rateLimit } from "./limiter";
import { GRID_SIZE, TOTAL_CELLS } from "./constants";
import WledGridClient from "./wled";

const json = (response: any) =>
  new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });

export class GridServer extends Server {
  static options = { hibernate: true };
  private intervalId: NodeJS.Timeout | null = null;
  private connections: Set<Connection> = new Set();
  private wled: WledGridClient | null = null;
  private wledSyncTimer: NodeJS.Timeout | null = null;
  private dirtyIndices: Set<number> = new Set();
  private readonly MAX_UPDATES_PER_TICK = 256;

  // constructor(readonly room: Party.Room) {}

  // Initialize grid with all cells undefined
  gridState: { color: string | undefined }[] = this.createEmptyGrid();

  private createEmptyGrid() {
    return new Array(TOTAL_CELLS).fill(null).map(() => ({ color: undefined }));
  }

  private broadcastUserCount() {
    const count = this.connections.size;
    this.broadcast(JSON.stringify({
      type: 'userCount',
      count
    }));
  }

  async onStart() {
    try {
      console.log('Starting WLED sync loop');
      // Load grid state from storage on startup
      const savedState = await this.ctx.storage.get<{ color: string | undefined }[]>("gridState");
      if (savedState) {
        // Ensure each cell has a valid state
        this.gridState = savedState.map(cell => ({
          color: cell?.color ?? undefined
        }));
      }

      // Initialize WLED client
      const baseUrl = 'http://wled-grid.local';
      this.wled = new WledGridClient({
        baseUrl,
        gridWidth: GRID_SIZE,
        gridHeight: GRID_SIZE,
        serpentine: false,
        orientation: 'top-left',
        defaultTransitionMs: 0,
        includeVerboseResponse: false,
      });

      // Mark all cells dirty for initial sync; the sync loop will trickle these out.
      for (let i = 0; i < TOTAL_CELLS; i++) this.dirtyIndices.add(i);

      // Start WLED sync loop (decoupled from client draw events)
      const syncIntervalMs = 1000;
      this.startWledSyncLoop(syncIntervalMs);

    } catch (err) {
      console.error('Error loading state:', err);
      this.gridState = this.createEmptyGrid();
    }
  }

  async onClose() {
    // Clean up interval when server closes
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (this.wledSyncTimer) {
      clearInterval(this.wledSyncTimer);
      this.wledSyncTimer = null;
    }
  }

  async onRequest(req: Request) {
    const url = new URL(req.url);
    // Return current grid state for regular requests
    return json({ type: 'fullState', state: this.gridState });
  }

  onConnect(conn: Connection) {
    // Add connection to set
    this.connections.add(conn);

    // Send current grid state to new connection
    conn.send(JSON.stringify({ type: 'fullState', state: this.gridState }));

    // Broadcast updated user count
    this.broadcastUserCount();

  }

  onDisconnect(conn: Connection) {
    // Remove connection from set
    this.connections.delete(conn);

    // Broadcast updated user count
    this.broadcastUserCount();
  }

  onMessage(connection: Connection, message: string) {
    // Rate limit incoming messages
    // rateLimit(sender, 100, () => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'draw' &&
            typeof data.x === 'number' &&
            typeof data.y === 'number' &&
            typeof data.color === 'string' &&
            data.x >= 0 && data.x < GRID_SIZE &&
            data.y >= 0 && data.y < GRID_SIZE) {

          const index = data.y * GRID_SIZE + data.x;

          // Update the cell color
          this.gridState[index] = { color: data.color };
          // Mark index as dirty for WLED sync loop
          this.dirtyIndices.add(index);

          // Broadcast the update to all clients
          this.broadcast(JSON.stringify({
            type: 'gridUpdate',
            index,
            color: data.color
          }));

          // Save state to storage (fire and forget)
          this.ctx.storage.put("gridState", this.gridState);
          // No direct WLED flush here; handled by sync loop
        } else if (data.type === 'clear') {
          // Clear the entire grid
          this.gridState = this.createEmptyGrid();

          // Broadcast the cleared state to all clients
          this.broadcast(JSON.stringify({
            type: 'fullState',
            state: this.gridState
          }));

          // Save the cleared state
          this.ctx.storage.put("gridState", this.gridState);

          // Clear WLED by setting all pixels to black and flushing immediately
          try {
            // Mark all indices dirty; sync loop will handle actual sending
            for (let i = 0; i < TOTAL_CELLS; i++) this.dirtyIndices.add(i);
          } catch (_) {
            // ignore WLED clear errors
          }
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    // });
  }

  // Convert various color strings (e.g. '#RRGGBB' or 'rgb(r,g,b)') to WLED hex without '#'
  private toHex(color: string | undefined): string {
    if (!color) return '000000';
    const c = color.trim();
    if (c.startsWith('#')) {
      const hex = c.slice(1);
      if (hex.length === 3) {
        const r = hex[0];
        const g = hex[1];
        const b = hex[2];
        return (r + r + g + g + b + b).toUpperCase();
      }
      return hex.slice(0, 6).toUpperCase();
    }
    const m = c.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
      || c.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|0?\.\d+|1(?:\.0)?)\s*\)$/i);
    if (m) {
      const r = Math.max(0, Math.min(255, Number(m[1])));
      const g = Math.max(0, Math.min(255, Number(m[2])));
      const b = Math.max(0, Math.min(255, Number(m[3])));
      const hex = (n: number) => n.toString(16).padStart(2, '0');
      return `${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
    }
    // Fallback: assume already hex without '#'
    return c.toUpperCase();
  }

  private startWledSyncLoop(intervalMs: number) {
    if (this.wledSyncTimer) clearInterval(this.wledSyncTimer);
    this.wledSyncTimer = setInterval(() => {
      try {
        if (!this.wled) {
          console.log('No WLED client');
          return;
        };
        if (this.dirtyIndices.size === 0) {
          console.log('No dirty indices');
          return;
        };
        const updates: { index: number; color: string }[] = [];
        let count = 0;
        // Drain up to MAX_UPDATES_PER_TICK dirty indices
        for (const idx of this.dirtyIndices) {
          this.dirtyIndices.delete(idx);
          const color = this.gridState[idx]?.color;
          const hex = this.toHex(color);
          updates.push({ index: idx, color: hex });
          count++;
          if (count >= this.MAX_UPDATES_PER_TICK) {
            break;
          };
        }
        if (updates.length > 0) {
          this.wled.sendPixels(updates).catch((err) => {
            console.log('WLED error', err);
          });
        }
      } catch (err) {
        // Keep loop resilient
      }
    }, Math.max(10, Math.round(intervalMs)));
  }
}

export default {
  // Set up your fetch handler to use configured Servers
  fetch(request, env) {
    return (
      routePartykitRequest(request, env) ||
      new Response("Not Found", { status: 404 })
    );
  }
};
