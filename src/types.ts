import z from "zod";

export const SLOW_DOWN_SENTINEL = "slowdown";
export const GO_AWAY_SENTINEL = "goaway";

// Grid cell state
export interface GridCell {
  color: string | undefined;
}

// Client-to-server message types
export interface DrawMessage {
  type: 'draw';
  x: number;
  y: number;
  color: string;
}

export interface ClearMessage {
  type: 'clear';
}

export type ClientMessage = DrawMessage | ClearMessage;

// Server-to-client message types
export interface GridUpdateMessage {
  type: 'gridUpdate';
  index: number;
  color: string;
}

export interface FullStateMessage {
  type: 'fullState';
  state: GridCell[];
}

export interface UserCountMessage {
  type: 'userCount';
  count: number;
}

export type ServerMessage = GridUpdateMessage | FullStateMessage | UserCountMessage;

// WLED-specific types
export interface WledSegment {
  id: number;
  i: Array<number | string>; // [index, hex, index, hex, ...] or [start, stop, hex, ...]
}

export interface WledStateUpdate {
  on?: boolean;
  bri?: number;
  tt?: number;
  v?: boolean;
  seg?: WledSegment[];
}

// Admin API types
export interface RoomInfo {
  id: string;
  connections: number;
  isActive: boolean;
}

export interface RoomsInfoResponse {
  type: 'roomsInfo';
  rooms: RoomInfo[];
  activeRoom: string;
}

export interface SwitchRoomResponse {
  success: boolean;
  activeRoom: string;
  message: string;
}
