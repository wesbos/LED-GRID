import { useState, useEffect, useRef, useCallback } from 'react';
import PartySocket from 'partysocket';

const PARTYKIT_HOST: string = `${window.location.origin}/party`;

export function usePartySocket(roomId: string) {
	const [isConnected, setIsConnected] = useState(false);
	const socketRef = useRef<PartySocket | null>(null);
	const messageListenersRef = useRef<Set<(data: unknown) => void>>(new Set());

	useEffect(() => {
		let room = roomId;
		if (room.startsWith('/')) room = room.slice(1);
		if (room.endsWith('/')) room = room.slice(0, -1);
		const finalRoomId = room.split('/').join('-') || 'default';

		// Setting up PartySocket connection

		// Create socket but don't connect yet
		const socket = new PartySocket({
			host: PARTYKIT_HOST,
			party: 'grid-server',
			room: finalRoomId,
			// Don't auto-connect - we'll do it manually after setting up listeners
			startClosed: true,
		});

		socketRef.current = socket;

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

		// Set up all event listeners BEFORE opening the connection
		socket.addEventListener('open', handleOpen);
		socket.addEventListener('close', handleClose);
		socket.addEventListener('error', handleError);
		socket.addEventListener('message', handleMessage);

		// Now open the connection after listeners are set up
		socket.reconnect();

		return () => {
			socket.removeEventListener('open', handleOpen);
			socket.removeEventListener('close', handleClose);
			socket.removeEventListener('error', handleError);
			socket.removeEventListener('message', handleMessage);
			socket.close();
			socketRef.current = null;
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
