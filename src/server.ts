// import type * as Party from "partykit/server";
import { routePartykitRequest, Server, type Connection, } from "partyserver";
import { rateLimit } from "./limiter";
import { GRID_SIZE, TOTAL_CELLS } from "./constants";
import WledGridClient, { wled } from "./wled/wled";
import { toHex } from "./utils";

const json = (response: any) =>
  new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });


  let count = 0;


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

      // Mark all cells dirty for initial sync; the sync loop will trickle these out.
      for (let i = 0; i < TOTAL_CELLS; i++) this.dirtyIndices.add(i);

      // Start WLED sync loop (decoupled from client draw events)
      const syncIntervalMs = 1000;
      this.updateLED(syncIntervalMs);

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
    rateLimit(connection.id, 100, () => {
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
    });
  }



  private updateLED() {
    if (this.dirtyIndices.size === 0) {
      // console.log('No dirty indices', Date.now());
      setTimeout(this.updateLED.bind(this), 200)
      return;
    };

    const updates: { index: number; color: string }[] = [];
    let count = 0;
    // Drain up to MAX_UPDATES_PER_TICK dirty indices
    for (const idx of this.dirtyIndices) {
      this.dirtyIndices.delete(idx);
      const color = this.gridState[idx]?.color;
      const hex = toHex(color);
      updates.push({ index: idx, color: hex });
      count++;
    }
    // Send the updates to WLED via a Fetch request
    if (!updates.length) {
      console.log('No updates to send', Date.now());
      setTimeout(this.updateLED.bind(this), 1000)
      return;
    };

    // console.log('Sending updates to worker B');
    // console.log(this.env.WORKER_B);
    // const result = await this.env.WORKER_B.add(1, 2);
    // console.log({result});
    // setTimeout(this.updateLED.bind(this), 1000)


    // console.log(`Sending ${updates.length} updates to worker B`);
    // // this.env.WORKER_B.sendPixels(updates);
    //     fetch('https://httpbin.org/delay/3').then(x => {
    //       console.log('WLED sent', Date.now());
    //       console.log('Slow fetch done!');
    //       setTimeout(this.updateLED.bind(this), 1000)
    //     });



    // try emit the update over a socket
    // this.broadcast(JSON.stringify({ type: 'LED_UPDATE', updates }));
    // console.log('LED_UPDATE sent', Date.now());
    // setTimeout(this.updateLED.bind(this), 1000)


    // Send the updates to WLED via a Fetch request
    // This is the slow part that blocks websockets
    const start = Date.now();
    wled.sendPixels(updates).then(() => {
      console.log('WLED Fetch done in ', Math.round((Date.now() - start)), 'ms');
      setTimeout(this.updateLED.bind(this), 100)

    }).catch((err) => {
      console.log('WLED error.Not retrying', err);
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
