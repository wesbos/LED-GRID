// import type * as Party from "partykit/server";
import { routePartykitRequest, Server, type Connection, } from "partyserver";
import { rateLimit } from "./limiter";
import { GRID_SIZE, TOTAL_CELLS } from "./constants";
import { wled } from "./wled/wled";
import { toHex } from "./utils";

const json = (response: any) =>
  new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });


export class GridServer extends Server {
  static options = { hibernate: true };
  private connections: Set<Connection> = new Set();
  private dirtyIndices: Set<number> = new Set();

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

      // Mark all cells dirty for initial sync; the sync loop will trickle these out.
      for (let i = 0; i < TOTAL_CELLS; i++) this.dirtyIndices.add(i);

      // Start WLED sync loop (decoupled from client draw events)
      this.updateLED();

    } catch (err) {
      console.error('Error loading state:', err);
      this.gridState = this.createEmptyGrid();
    }
  }

  async onClose() {
    console.log(`[SERVER CLOSED]`);
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

  async onMessage(connection: Connection, message: string) {
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

        // Immediately clear WLED using a single range command when possible
        try {
          await wled.clearAll();
        } catch (err) {
          console.error('Failed to clear WLED:', err);
        }
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  }


  private updateLED() {
    const retryMs = wled.useWebSocket ? 1 : 1000;
    const retryFn = setTimeout.bind(null, this.updateLED.bind(this), retryMs);

    if (this.dirtyIndices.size === 0) {
      retryFn();
      return;
    };

    const updates: { index: number; color: string }[] = [];

    for (const idx of this.dirtyIndices) {
      this.dirtyIndices.delete(idx);
      const color = this.gridState[idx]?.color;
      const hex = toHex(color);
      updates.push({ index: idx, color: hex });

    }
    // Send the updates to WLED via a Fetch request
    if (!updates.length) {
      console.log('No updates to send', Date.now());
      retryFn();
      return;
    };

    const start = Date.now();
    console.log(`Sending ${updates.length} updates to WLED`);
    wled.sendPixels(updates).then(() => {
      console.log('WLED Fetch done in ', Math.round((Date.now() - start)), 'ms');
      retryFn();
    }).catch((err) => {
      console.log('WLED error.retrying in 5 seconds', err);
      retryFn();
    });
  }
}

export default {
  // Set up your fetch handler to use configured Servers
  async fetch(request: Request, env: any) {
    return (
      routePartykitRequest(request, env, {
        prefix: 'party/parties'
      }) ||
      new Response("Not Found", { status: 404 })
    );
  }
};
