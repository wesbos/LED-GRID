import type * as Party from "partykit/server";
import { rateLimit } from "./limiter";
import { GRID_SIZE, TOTAL_CELLS } from "./constants";

const json = (response: any) =>
  new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });

export default class GridServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };
  private intervalId: NodeJS.Timeout | null = null;
  private connections: Set<Party.Connection> = new Set();

  constructor(readonly room: Party.Room) {}

  // Initialize grid with all cells undefined
  gridState: { color: string | undefined }[] = this.createEmptyGrid();

  private createEmptyGrid() {
    return new Array(TOTAL_CELLS).fill(null).map(() => ({ color: undefined }));
  }

  private broadcastUserCount() {
    const count = this.connections.size;
    this.room.broadcast(JSON.stringify({
      type: 'userCount',
      count
    }));
  }

  async onStart() {
    try {
      // Load grid state from storage on startup
      const savedState = await this.room.storage.get<{ color: string | undefined }[]>("gridState");
      if (savedState) {
        // Ensure each cell has a valid state
        this.gridState = savedState.map(cell => ({
          color: cell?.color ?? undefined
        }));
      }

      // Set up periodic state logging and storage
      this.intervalId = setInterval(async () => {
        const timestamp = new Date().toISOString();
        const stateSnapshot = {
          timestamp,
          state: this.gridState
        };

        // Log to console
        console.log('Current Grid State:', timestamp);
        console.log(JSON.stringify(this.gridState, null, 2));

        // Store in KV with timestamp as key
        try {
          await this.room.storage.put(`history:${timestamp}`, stateSnapshot);
        } catch (err) {
          console.error('Failed to store state history:', err);
        }
      }, 1000);
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
  }

  async onRequest(req: Party.Request) {
    const url = new URL(req.url);

    // Handle history request
    if (url.pathname.endsWith('/history')) {
      // Get all keys that start with 'history:'
      const historyKeys = await this.room.storage.list({ prefix: 'history:' });
      const history = await Promise.all(
        Array.from(historyKeys).map(async ([key]) => {
          const snapshot = await this.room.storage.get(key);
          return snapshot;
        })
      );
      return json({ type: 'history', history });
    }

    // Return current grid state for regular requests
    return json({ type: 'fullState', state: this.gridState });
  }

  onConnect(conn: Party.Connection) {
    // Add connection to set
    this.connections.add(conn);

    // Send current grid state to new connection
    conn.send(JSON.stringify({ type: 'fullState', state: this.gridState }));

    // Broadcast updated user count
    this.broadcastUserCount();
  }

  onDisconnect(conn: Party.Connection) {
    // Remove connection from set
    this.connections.delete(conn);

    // Broadcast updated user count
    this.broadcastUserCount();
  }

  onMessage(message: string, sender: Party.Connection) {
    // Rate limit incoming messages
    rateLimit(sender, 100, () => {
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

          // Broadcast the update to all clients
          this.room.broadcast(JSON.stringify({
            type: 'gridUpdate',
            index,
            color: data.color
          }));

          // Save state to storage (fire and forget)
          this.room.storage.put("gridState", this.gridState);
        } else if (data.type === 'clear') {
          // Clear the entire grid
          this.gridState = this.createEmptyGrid();

          // Broadcast the cleared state to all clients
          this.room.broadcast(JSON.stringify({
            type: 'fullState',
            state: this.gridState
          }));

          // Save the cleared state
          this.room.storage.put("gridState", this.gridState);
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    });
  }
}

GridServer satisfies Party.Worker;
