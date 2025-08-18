import { useState, useEffect, useRef, useCallback } from 'react';
import PartySocket from 'partysocket';

const PARTYKIT_HOST: string = `${window.location.origin}/party`;

// Global socket cache to persist across hot reloads
const socketCache = new Map<string, PartySocket>();

export function usePartySocket(roomId: string) {
	const [isConnected, setIsConnected] = useState(false);
	const socketRef = useRef<PartySocket | null>(null);
	const messageListenersRef = useRef<Set<(data: unknown) => void>>(new Set());

	useEffect(() => {
		let room = roomId;
		if (room.startsWith('/')) room = room.slice(1);
		if (room.endsWith('/')) room = room.slice(0, -1);
		const finalRoomId = room.split('/').join('-') || 'default';

		// Try to reuse existing socket for this room to survive hot reloads
		let socket = socketCache.get(finalRoomId);

		if (!socket || socket.readyState === WebSocket.CLOSED) {
			// Create new socket if none exists or if closed
			socket = new PartySocket({
				host: PARTYKIT_HOST,
				party: 'grid-server',
				room: finalRoomId,
				startClosed: true,
			});
			socketCache.set(finalRoomId, socket);
		}

		socketRef.current = socket;

		// Update connection state based on current socket state
		setIsConnected(socket.readyState === WebSocket.OPEN);

		const handleOpen = () => {
			setIsConnected(true);
		};
		const handleClose = (e: CloseEvent) => {
			setIsConnected(false);
		};
		const handleError = (error: Event) => {
			console.error('[Socket] Connection error:', error);
			setIsConnected(false);
		};

		// Handle incoming messages and distribute to all listeners
		const handleMessage = (event: MessageEvent) => {
			try {
				// PartySocket might provide parsed JSON directly, or as a string
				let data;
				if (typeof event.data === 'string') {
					data = JSON.parse(event.data);
				} else {
					data = event.data; // Already parsed
				}
				// Notify all message listeners
				messageListenersRef.current.forEach(listener => {
					try {
						listener(data);
					} catch (err) {
						console.error('[Socket] Error in message listener:', err);
					}
				});
			} catch (err) {
				console.error('[Socket] Failed to parse message:', err, event.data);
			}
		};

		// Remove any existing listeners to avoid duplicates
		socket.removeEventListener('open', handleOpen);
		socket.removeEventListener('close', handleClose);
		socket.removeEventListener('error', handleError);
		socket.removeEventListener('message', handleMessage);

		// Set up all event listeners
		socket.addEventListener('open', handleOpen);
		socket.addEventListener('close', handleClose);
		socket.addEventListener('error', handleError);
		socket.addEventListener('message', handleMessage);

		// Open connection if not already open
		if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
			socket.reconnect();
		}

		return () => {
			// Don't close the socket on cleanup - let it persist for hot reloads
			// Just remove our specific listeners
			socket.removeEventListener('open', handleOpen);
			socket.removeEventListener('close', handleClose);
			socket.removeEventListener('error', handleError);
			socket.removeEventListener('message', handleMessage);
		};
	}, [roomId]);

	// Function to subscribe to messages
	const subscribeToMessages = useCallback((listener: (data: unknown) => void) => {
		messageListenersRef.current.add(listener);
		return () => {
			messageListenersRef.current.delete(listener);
		};
	}, []);

	return {
		socket: socketRef.current,
		isConnected,
		subscribeToMessages,
	};
}
