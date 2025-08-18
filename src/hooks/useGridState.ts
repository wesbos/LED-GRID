import { useState, useEffect, useRef, useCallback } from 'react';
import { GRID_WIDTH, GRID_HEIGHT, TOTAL_CELLS } from '../constants';
import type { GridCell, ServerMessage } from '../types';

export function useGridState() {
	const [gridState, setGridState] = useState<GridCell[]>(
		Array(TOTAL_CELLS).fill(null).map(() => ({ color: undefined }))
	);
	const [userCount, setUserCount] = useState(1);
	const socketRef = useRef<WebSocket | null>(null);

	// Update grid size CSS variables
	useEffect(() => {
		document.documentElement.style.setProperty('--grid-width', GRID_WIDTH.toString());
		document.documentElement.style.setProperty('--grid-height', GRID_HEIGHT.toString());
	}, []);

	// Function to update a single cell
	const updateCell = useCallback((index: number, color: string | undefined) => {
		if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
			console.warn('[GridState] updateCell called but socket is not ready', {
				hasSocket: !!socketRef.current,
				readyState: socketRef.current?.readyState
			});
			return;
		}

		const x = index % GRID_WIDTH;
		const y = Math.floor(index / GRID_WIDTH);
		const payload = { type: 'draw', x, y, color } as const;

		try {
			socketRef.current.send(JSON.stringify(payload));
		} catch (error) {
			console.error('[GridState] Failed to send draw message:', error);
		}
	}, []);

	// Function to clear the grid
	const clearGrid = useCallback(() => {
		if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
			console.warn('[GridState] clearGrid called but socket is not ready');
			return;
		}

		try {
			socketRef.current.send(JSON.stringify({ type: 'clear' }));
		} catch (error) {
			console.error('[GridState] Failed to send clear message:', error);
		}
	}, []);

	// Function to set the socket reference
	const setSocket = useCallback((socket: WebSocket | null) => {
		socketRef.current = socket;
		// Socket reference updated
	}, []);

		// Function to handle incoming messages - stable reference
	const handleMessage = useCallback((data: unknown) => {
		try {
			// Type guard to ensure data is a valid server message
			if (!data || typeof data !== 'object' || !('type' in data)) {
				console.warn('[GridState] Invalid message format', data);
				return;
			}

			if (data.type === 'gridUpdate' && 'index' in data && 'color' in data) {
				setGridState((prev: GridCell[]) => {
					const next = [...prev];
					next[data.index as number] = { color: (data.color as string) ?? undefined };
					return next;
				});
				return;
			}

			if (data.type === 'fullState' && 'state' in data) {
				const state = data.state as Array<GridCell | null>;
				const next = state.map((cellData) => ({
					color: cellData?.color ?? undefined,
				}));
				console.log('[GridState] Applying fullState', {
					cells: next.length,
					coloredCells: next.filter(cell => cell.color).length
				});
				setGridState(next);
				return;
			}

			if (data.type === 'userCount' && 'count' in data) {
				setUserCount(data.count as number);
				return;
			}
		} catch (err) {
			console.error('[GridState] Failed to process message', err, data);
		}
	}, []);

	return {
		gridState,
		userCount,
		updateCell,
		clearGrid,
		setSocket,
		handleMessage,
	};
}
