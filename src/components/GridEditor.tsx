import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { usePartySocket } from '../hooks/usePartySocket';
import { useGridState } from '../hooks/useGridState';
import { drawImageToGrid, drawText } from '../utils/drawingUtils';
import { drawImageToGridBatch, drawTextBatch } from '../utils/batchDrawingUtils';
import { captureWebcamToGrid, cleanupWebcam, WebcamCapture, initializeWebcamPreview, getAvailableCameras, startLiveWebcamCapture, stopLiveWebcamCapture, isLiveWebcamCapture, type CameraDevice } from '../utils/webcamUtils';
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
	const [webcamSupported, setWebcamSupported] = useState(false);
	const [webcamLoading, setWebcamLoading] = useState(false);
	const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
	const [selectedCamera, setSelectedCamera] = useState<string>('');
	const [webcamActive, setWebcamActive] = useState(false);
	const [isLiveCapturing, setIsLiveCapturing] = useState(false);

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

	// Check webcam support and load cameras on mount
	useEffect(() => {
		const supported = WebcamCapture.isSupported();
		setWebcamSupported(supported);

		if (supported) {
			// Load available cameras
			getAvailableCameras().then(cameras => {
				setAvailableCameras(cameras);
				if (cameras.length > 0) {
					setSelectedCamera(cameras[0].deviceId);
				}
			}).catch(error => {
				console.error('Failed to load cameras:', error);
			});
		}

		return () => {
			// Cleanup webcam resources when component unmounts
			cleanupWebcam();
		};
	}, []);

	// Sync live capture state periodically
	useEffect(() => {
		const interval = setInterval(() => {
			setIsLiveCapturing(isLiveWebcamCapture());
		}, 500);

		return () => clearInterval(interval);
	}, []);

	const gridRef = useRef<HTMLDivElement>(null);
	const webcamPreviewRef = useRef<HTMLDivElement>(null);

	// Handle drawing with pointer events
	const handleDrawEvent = useCallback((e: React.PointerEvent, forceDrawing = false) => {
		if ((!isDrawing && !forceDrawing) || !gridRef.current) return;

		const cell = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
		if (!cell?.classList.contains('cell')) return;

		const index = parseInt(cell.dataset.index || '0');
		if (isNaN(index)) return;
		updateCell(index, currentColor);
	}, [isDrawing, currentColor, updateCell]);

	// Pointer event handlers
	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		setIsDrawing(true);
		const target = e.target as HTMLElement;
		target.setPointerCapture(e.pointerId);
		// Force drawing for initial click to handle single clicks
		handleDrawEvent(e, true);
	}, [handleDrawEvent]);

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		// Only draw during move if we're actively drawing (dragging)
		handleDrawEvent(e, false);
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
			// Use batch drawing for much better performance
			await drawImageToGridBatch(file, socket as any);
		}
	}, [socket]);

	// Text form submission
	const handleTextSubmit = useCallback((e: React.FormEvent) => {
		e.preventDefault();
		if (textInput.trim() && socket) {
			// Use batch drawing for much better performance
			drawTextBatch(textInput.trim(), currentColor, socket as any);
			setTextInput('');
		}
	}, [textInput, currentColor, socket]);

	// Start/stop webcam preview
	const handleWebcamToggle = useCallback(async () => {
		if (!webcamSupported) return;

		if (webcamActive) {
			cleanupWebcam();
			setWebcamActive(false);
		} else {
			try {
				setWebcamLoading(true);
				await initializeWebcamPreview(selectedCamera, webcamPreviewRef.current || undefined);
				setWebcamActive(true);
			} catch (error) {
				console.error('Failed to start webcam:', error);
				alert(`Webcam failed to start: ${error}`);
			} finally {
				setWebcamLoading(false);
			}
		}
	}, [webcamSupported, webcamActive, selectedCamera]);

	// Handle camera selection change
	const handleCameraChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newDeviceId = e.target.value;
		setSelectedCamera(newDeviceId);

		// If webcam is active, restart it with the new camera
		if (webcamActive) {
			try {
				setWebcamLoading(true);
				await initializeWebcamPreview(newDeviceId, webcamPreviewRef.current || undefined);
			} catch (error) {
				console.error('Failed to switch camera:', error);
				alert(`Failed to switch camera: ${error}`);
			} finally {
				setWebcamLoading(false);
			}
		}
	}, [webcamActive]);

	// Live capture toggle handler
	const handleLiveCaptureToggle = useCallback(async () => {
		if (!socket || !webcamSupported) return;

		if (isLiveCapturing) {
			stopLiveWebcamCapture();
			setIsLiveCapturing(false);
		} else {
			setWebcamLoading(true);
			try {
				await startLiveWebcamCapture(socket as any, selectedCamera, webcamPreviewRef.current || undefined);
				setIsLiveCapturing(true);
				setWebcamActive(true); // Ensure webcam is shown as active
			} catch (error) {
				console.error('Failed to start live capture:', error);
				alert(`Live capture failed to start: ${error}`);
			} finally {
				setWebcamLoading(false);
			}
		}
	}, [socket, webcamSupported, selectedCamera, isLiveCapturing]);

	// Single frame capture handler
	const handleWebcamCapture = useCallback(async () => {
		if (!socket || !webcamSupported) return;

		setWebcamLoading(true);
		try {
			await captureWebcamToGrid(socket as any, selectedCamera, webcamPreviewRef.current || undefined);
		} catch (error) {
			console.error('Failed to capture webcam:', error);
			alert(`Webcam capture failed: ${error}`);
		} finally {
			setWebcamLoading(false);
		}
	}, [socket, webcamSupported, selectedCamera]);

	// Navigation function
	const navigate = (window as any).navigate;

	return (
		<>
			<div className={`user-count ${dragActive ? 'drag-active' : ''}`}>
				<span>{userCount} others here</span>
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

										{webcamSupported && (
						<div className="webcam-controls">
							<div className="webcam-actions">
								<button
									type="button"
									onClick={handleWebcamToggle}
									disabled={webcamLoading || isLiveCapturing}
									title={webcamActive ? "Stop webcam preview" : "Start webcam preview"}
									className="webcam-button"
								>
									{webcamLoading ? '📷...' : webcamActive ? '📷 Stop' : '📷 Start'}
								</button>

								{webcamActive && !isLiveCapturing && (
									<button
										type="button"
										onClick={handleWebcamCapture}
										disabled={webcamLoading}
										title="Capture current frame to grid"
										className="capture-button"
									>
										{webcamLoading ? '⏺️...' : '⏺️ Capture'}
									</button>
								)}

								{webcamActive && (
									<button
										type="button"
										onClick={handleLiveCaptureToggle}
										disabled={webcamLoading}
										title={isLiveCapturing ? "Stop live streaming to grid (1fps)" : "Start live streaming to grid (1fps)"}
										className={isLiveCapturing ? "live-stop-button" : "live-start-button"}
									>
										{webcamLoading ? '🔴...' : isLiveCapturing ? '🔴 Stop Live' : '🔴 Live'}
									</button>
								)}
							</div>

							{isLiveCapturing && (
								<div className="live-indicator">
									🔴 LIVE - Streaming every second
								</div>
							)}

							{availableCameras.length > 1 && (
								<select
									value={selectedCamera}
									onChange={handleCameraChange}
									disabled={webcamLoading}
									className="camera-select"
									title="Select camera"
								>
									{availableCameras.map(camera => (
										<option key={camera.deviceId} value={camera.deviceId}>
											{camera.label}
										</option>
									))}
								</select>
							)}

							{webcamActive && (
								<div
									ref={webcamPreviewRef}
									className="webcam-preview-container"
									title="Live webcam preview"
								></div>
							)}
						</div>
					)}

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
