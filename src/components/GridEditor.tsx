import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { usePartySocket } from '../hooks/usePartySocket';
import { useGridState } from '../hooks/useGridState';
import { drawImageToGrid, drawText } from '../utils/drawingUtils';
import { ColorPicker, getRandomColor } from './ColorPicker';
import { Grid } from './Grid';

interface GridEditorProps {
	roomId?: string; // undefined for default room, string for specific rooms
	showRoomInfo?: boolean; // whether to show room-specific UI elements
}

export function GridEditor({ roomId = 'default', showRoomInfo = false }: GridEditorProps) {
	const [currentColor, setCurrentColor] = useState(() => getRandomColor());
	const [isDrawing, setIsDrawing] = useState(false);
	const [textInput, setTextInput] = useState('');
	const [dragActive, setDragActive] = useState(false);

	const { gridState, updateCell, clearGrid, userCount, setSocket, handleMessage } = useGridState();
	const { socket, isConnected, subscribeToMessages } = usePartySocket(roomId);

	// Subscribe to messages from the socket - stable across hot reloads
	useEffect(() => {
		if (!subscribeToMessages) return;

		const unsubscribe = subscribeToMessages(handleMessage);
		return unsubscribe;
	}, [subscribeToMessages, handleMessage]);

	// Wire up socket when it becomes available - ensure it persists across hot reloads
	useEffect(() => {
		if (!socket) return;
		setSocket(socket as unknown as WebSocket);
	}, [socket, setSocket]);

	const gridRef = useRef<HTMLDivElement>(null);

	// Handle drawing with pointer events
	const handleDrawEvent = useCallback((e: React.PointerEvent) => {
		if (!isDrawing || !gridRef.current) return;

		const cell = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
		if (!cell?.classList.contains('cell')) return;

		const index = parseInt(cell.dataset.index || '0');
		if (isNaN(index)) return;
		updateCell(index, currentColor);
	}, [isDrawing, currentColor, updateCell, roomId]);

	// Pointer event handlers
	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		setIsDrawing(true);
		const target = e.target as HTMLElement;
		target.setPointerCapture(e.pointerId);
		handleDrawEvent(e);
	}, [handleDrawEvent]);

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		handleDrawEvent(e);
	}, [handleDrawEvent]);

	const handlePointerUp = useCallback(() => {
		setIsDrawing(false);
	}, []);

	// Drag and drop handlers
	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!e.relatedTarget) {
			setDragActive(false);
		}
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);

		const file = e.dataTransfer?.files[0];
		if (file?.type.startsWith('image/') && socket) {
			await drawImageToGrid(file, socket as any);
		}
	}, [socket]);

	// Text form submission
	const handleTextSubmit = useCallback((e: React.FormEvent) => {
		e.preventDefault();
		if (textInput.trim() && socket) {
			drawText(textInput.trim(), currentColor, socket as any);
			setTextInput('');
		}
	}, [textInput, currentColor, socket]);

	// Navigation function
	const navigate = (window as any).navigate;

	return (
		<>
			<div className={`user-count ${dragActive ? 'drag-active' : ''}`}>
				<span className="user-count-icon">👥</span>
				<span>{userCount}</span> collaborators
				<button
					className="admin-link"
					title="Admin Panel"
					onClick={() => navigate('/admin')}
				>
					⚙️
				</button>
			</div>

			<main>
				<div className="controls">
					{showRoomInfo && (
						<>
							<h2>Room: {roomId}</h2>
							<p>This is room <strong>{roomId}</strong>. Draw something here and then switch to this room in the admin panel.</p>
						</>
					)}

					<form onSubmit={handleTextSubmit} className="text-input-form">
						<input
							type="text"
							value={textInput}
							onChange={(e) => setTextInput(e.target.value)}
							placeholder="Type something..."
							maxLength={10}
							aria-label="Text to draw"
						/>
						<button type="submit">Draw</button>
					</form>

					<ColorPicker
						currentColor={currentColor}
						onColorChange={setCurrentColor}
					/>

					<button
						type="button"
						onClick={clearGrid}
						title="Clear all"
					>
						Clear
					</button>
				</div>

				<Grid
					ref={gridRef}
					gridState={gridState}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerLeave={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onDragEnter={handleDragEnter}
					onDragLeave={handleDragLeave}
					onDragOver={handleDragOver}
					onDrop={handleDrop}
				/>

				<footer>
					{showRoomInfo ? (
						<p className="hint">
							Draw something in this room, then go to the <button
								className="link-button"
								onClick={() => navigate('/admin')}
							>
								admin panel
							</button> to switch to this room on the LED display.
						</p>
					) : (
						<p className="hint"></p>
					)}
				</footer>
			</main>
		</>
	);
}
