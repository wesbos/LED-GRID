// import type * as Party from "partykit/server";
import { routePartykitRequest, Server, type Connection, } from "partyserver";
import { rateLimit } from "./limiter";
import { GRID_WIDTH, GRID_HEIGHT, TOTAL_CELLS, WLED_CONFIG } from "./constants";
import { wled } from "./wled/wled";
import { toHex } from "./utils";
import type { GridCell, ClientMessage, ServerMessage, RoomInfo, RoomsInfoResponse, SwitchRoomResponse } from "./types";
import { UtilityManager } from "./utilities/UtilityManager";
import { SocialStatsUtility } from "./utilities/SocialStatsUtility";
import { GitHubUtility } from "./utilities/GithubUtility";
import { BuildStatusUtility } from "./utilities/BuildStatusUtility";
import { isAdminAuthorized, createUnauthorizedResponse } from "./auth";

const json = (response: unknown) =>
  new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });

export class GridServer extends Server {
  static options = { hibernate: true };
  private dirtyIndices: Set<number> = new Set();
  private utilityManager: UtilityManager = new UtilityManager();

  // Initialize grid with all cells undefined
  gridState: GridCell[] = this.createEmptyGrid();

  // Room management - static properties to track across instances
  private static activeRoom: string = "default";
  private static roomStates: Map<string, GridCell[]> = new Map();
  private static roomConnections: Map<string, Set<string>> = new Map();
  private static serverInstances: Map<string, GridServer> = new Map();

  private createEmptyGrid() {
    return new Array(TOTAL_CELLS).fill(null).map(() => ({ color: undefined }));
  }

  private setupUtilities() {
    // Register all available utilities
    this.utilityManager.registerUtility(new SocialStatsUtility());
    this.utilityManager.registerUtility(new GitHubUtility('wesbos')); // Pass username
    this.utilityManager.registerUtility(new BuildStatusUtility());

    // Set up callback to update grid when utility runs
    this.utilityManager.setGridUpdateCallback((gridData, metadata) => {
      // Update our grid state
      this.gridState = [...gridData];

      // Mark all cells as dirty for LED sync
      for (let i = 0; i < TOTAL_CELLS; i++) {
        this.dirtyIndices.add(i);
      }

      // Broadcast to all connected clients
      this.broadcast(JSON.stringify({
        type: 'fullState',
        state: this.gridState
      }));

      // Save state
      this.ctx.storage.put("gridState", this.gridState);

      console.log(`[UtilityManager] Updated grid with utility data`, { metadata });
    });
  }

  // Get the current active room
  static getActiveRoom(): string {
    return GridServer.activeRoom;
  }

  // Set the active room and sync to LED
  static async setActiveRoom(roomId: string): Promise<boolean> {
    if (roomId === GridServer.activeRoom) {
      return true; // Already active
    }

    // Get the state for the new room
    const newRoomState = GridServer.roomStates.get(roomId);
    if (!newRoomState) {
      return false; // Room doesn't exist
    }

    // Update active room
    GridServer.activeRoom = roomId;

    // Clear current LED display
    try {
      await wled.clearAll();
    } catch (err) {
      console.error('Failed to clear WLED when switching rooms:', err);
    }

    // Set new room state and mark all cells as dirty for LED sync
    const server = GridServer.serverInstances.get(roomId);
    if (server) {
      server.gridState = [...newRoomState];
      for (let i = 0; i < TOTAL_CELLS; i++) {
        server.dirtyIndices.add(i);
      }
      // Trigger LED update
      server.updateLED();
    }

    return true;
  }

  // Get all available rooms with their stats
  static getRoomsInfo(): RoomInfo[] {
    const rooms: RoomInfo[] = [];

    for (const [roomId, connections] of GridServer.roomConnections) {
      rooms.push({
        id: roomId,
        connections: connections.size,
        isActive: roomId === GridServer.activeRoom
      });
    }

    return rooms.sort((a, b) => {
      if (a.isActive) return -1;
      if (b.isActive) return 1;
      return b.connections - a.connections;
    });
  }

  private broadcastUserCount() {
    const connections = Array.from(this.getConnections());

    this.broadcast(JSON.stringify({
      type: 'userCount',
      count: connections.length
    }));
  }

  async onStart() {
    try {
      console.log('Starting WLED sync loop');

      // Get room ID from the server name
      const roomId = this.name || "default";
      console.log(`GridServer starting for room: ${roomId}`);

      // Initialize utilities
      this.setupUtilities();

      // Store this server instance for room switching
      GridServer.serverInstances.set(roomId, this);
      console.log(`Registered server instance for room: ${roomId}`);

      // Initialize room tracking
      if (!GridServer.roomConnections.has(roomId)) {
        GridServer.roomConnections.set(roomId, new Set());
        console.log(`Initialized room connections tracking for: ${roomId}`);
      }

      // Load grid state from storage on startup
      const savedState = await this.ctx.storage.get<{ color: string | undefined }[]>("gridState");
      if (savedState) {
        // Ensure each cell has a valid state
        this.gridState = savedState.map(cell => ({
          color: cell?.color ?? undefined
        }));
        const coloredCells = this.gridState.filter(cell => cell.color).length;
        console.log(`Loaded saved state for room: ${roomId} (${coloredCells} colored cells)`);
      } else {
        console.log(`No saved state found for room: ${roomId}, using empty grid`);
      }

      // Store this room's state
      GridServer.roomStates.set(roomId, [...this.gridState]);
      console.log(`Stored room state for: ${roomId}`);

      // Mark all cells dirty for initial sync; the sync loop will trickle these out.
      for (let i = 0; i < TOTAL_CELLS; i++) this.dirtyIndices.add(i);

      // Start WLED sync loop (decoupled from client draw events)
      this.updateLED();

    } catch (err) {
      console.error('Error loading state:', err);
      this.gridState = this.createEmptyGrid();
    }
  }

  async onRequest(req: Request) {
    const url = new URL(req.url);

    // Admin endpoints (protected)
    if (url.pathname.endsWith('/admin/rooms')) {
      if (!isAdminAuthorized(req)) {
        return createUnauthorizedResponse();
      }

      console.log('Admin request: /admin/rooms');
      const roomsInfo = GridServer.getRoomsInfo();
      console.log('Rooms info:', roomsInfo);
      return json({
        type: 'roomsInfo',
        rooms: roomsInfo,
        activeRoom: GridServer.getActiveRoom()
      });
    }

    if (url.pathname.endsWith('/admin/switch-room')) {
      if (!isAdminAuthorized(req)) {
        return createUnauthorizedResponse();
      }

      const roomId = url.searchParams.get('room');
      console.log(`Admin request: /admin/switch-room?room=${roomId}`);

      if (!roomId) {
        console.log('No room ID provided');
        return json({ error: 'Room ID required' });
      }

      const success = await GridServer.setActiveRoom(roomId);
      console.log(`Room switch result: ${success ? 'success' : 'failed'}`);

      return json({
        success,
        activeRoom: GridServer.getActiveRoom(),
        message: success ? `Switched to room: ${roomId}` : `Failed to switch to room: ${roomId}`
      });
    }

    // Utility endpoints (protected)
    if (url.pathname.endsWith('/utilities/list')) {
      if (!isAdminAuthorized(req)) {
        return createUnauthorizedResponse();
      }

      const utilities = this.utilityManager.getAvailableUtilities();
      return json({
        type: 'utilitiesList',
        utilities,
        activeUtility: this.utilityManager.getActiveUtility()
      });
    }

    if (url.pathname.endsWith('/utilities/execute')) {
      if (!isAdminAuthorized(req)) {
        return createUnauthorizedResponse();
      }

      const utilityId = url.searchParams.get('utility');
      if (!utilityId) {
        return json({ error: 'Utility ID required' });
      }

      const result = await this.utilityManager.executeUtility(utilityId);
      return json(result);
    }

    if (url.pathname.endsWith('/utilities/stop')) {
      if (!isAdminAuthorized(req)) {
        return createUnauthorizedResponse();
      }

      this.utilityManager.stopActiveUtility();
      return json({ success: true, message: 'Stopped active utility' });
    }

    // Return current grid state for regular requests
    return json({ type: 'fullState', state: this.gridState });
  }

  onConnect(conn: Connection) {
    // Track connection for this room
    const roomId = this.name || "default";
    const roomConnections = GridServer.roomConnections.get(roomId);
    if (roomConnections) {
      roomConnections.add(conn.id);
    }

    // Send current grid state to new connection
    const initialState = { type: 'fullState', state: this.gridState };
    const coloredCells = this.gridState.filter(cell => cell.color).length;
    console.log(`[Server] New connection ${conn.id} to room ${roomId}, sending ${coloredCells} colored cells`);
    conn.send(JSON.stringify(initialState));

    // Broadcast updated user count
    this.broadcastUserCount();
  }

  onClose(conn: Connection) {
    // Remove connection tracking
    const roomId = this.name || "default";
    const roomConnections = GridServer.roomConnections.get(roomId);
    if (roomConnections) {
      roomConnections.delete(conn.id);
    }

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
          data.x >= 0 && data.x < GRID_WIDTH &&
          data.y >= 0 && data.y < GRID_HEIGHT) {

        const index = data.y * GRID_WIDTH + data.x;

        // Update the cell color
        this.gridState[index] = { color: data.color };
        // Mark index as dirty for WLED sync loop
        this.dirtyIndices.add(index);

        // Update room state
        const roomId = this.name || "default";
        GridServer.roomStates.set(roomId, [...this.gridState]);

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

        // Update room state
        const roomId = this.name || "default";
        GridServer.roomStates.set(roomId, [...this.gridState]);

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
        } else if (data.type === 'executeUtility' && typeof data.utilityId === 'string') {
          const result = await this.utilityManager.executeUtility(data.utilityId);
          // Send result back to the client
          connection.send(JSON.stringify({
            type: 'utilityResult',
            ...result
          }));
        } else if (data.type === 'stopUtility') {
          this.utilityManager.stopActiveUtility();
          connection.send(JSON.stringify({
            type: 'utilityResult',
            success: true,
            message: 'Utility stopped'
          }));
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  }

  private updateLED() {
    // Only update LED if this room is currently active
    const roomId = this.name || "default";
    if (roomId !== GridServer.activeRoom) {
      // Schedule next check
      setTimeout(this.updateLED.bind(this), 1000);
      return;
    }

    const retryMs = wled.useWebSocket ? WLED_CONFIG.LED_UPDATE_RETRY_MS_WEBSOCKET : WLED_CONFIG.LED_UPDATE_RETRY_MS_HTTP;
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

    // const start = Date.now();
    // console.log(`Sending ${updates.length} updates to WLED`);
    wled.sendPixels(updates).then(() => {
      // console.log('WLED Fetch done in ', Math.round((Date.now() - start)), 'ms');
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
