import React, { forwardRef } from 'react';
import { TOTAL_CELLS } from '../constants';
import type { GridCell } from '../types';

interface GridProps {
	gridState: GridCell[];
	onPointerDown: (e: React.PointerEvent) => void;
	onPointerMove: (e: React.PointerEvent) => void;
	onPointerUp: (e: React.PointerEvent) => void;
	onPointerLeave: (e: React.PointerEvent) => void;
	onPointerCancel: (e: React.PointerEvent) => void;
	onDragEnter: (e: React.DragEvent) => void;
	onDragLeave: (e: React.DragEvent) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
}

export const Grid = forwardRef<HTMLDivElement, GridProps>(({ gridState, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onDragEnter, onDragLeave, onDragOver, onDrop, }, ref) => {
	// Log grid state changes (minimal logging)
	React.useEffect(() => {
		const coloredCount = gridState.filter(cell => cell.color).length;
		if (coloredCount > 0) {
			console.log(`[Grid] ${coloredCount}/${gridState.length} cells colored`);
		}
	}, [gridState]);

	const wrap = <T extends Function>(label: string, fn: T) => {
		return ((e: any) => {
			// Basic throttled-ish logging
			if ((e as PointerEvent).pointerType) {
				const pe = e as PointerEvent;
				// console.log(`[Grid] ${label}`, { x: pe.clientX, y: pe.clientY, type: pe.type });
			} else if ((e as DragEvent).dataTransfer !== undefined) {
				// console.log(`[Grid] ${label}`, { type: (e as DragEvent).type });
			}
			// @ts-ignore - preserve signature
			return fn(e);
		}) as unknown as T;
	};

	return (
		<div
			ref={ref}
			className="grid"
			role="grid"
			aria-label="LED Drawing Grid"
			style={{ touchAction: 'none' }}
			onPointerDown={wrap('pointerdown', onPointerDown)}
			onPointerMove={wrap('pointermove', onPointerMove)}
			onPointerUp={wrap('pointerup', onPointerUp)}
			onPointerLeave={wrap('pointerleave', onPointerLeave)}
			onPointerCancel={wrap('pointercancel', onPointerCancel)}
			onDragEnter={wrap('dragenter', onDragEnter)}
			onDragLeave={wrap('dragleave', onDragLeave)}
			onDragOver={wrap('dragover', onDragOver)}
			onDrop={wrap('drop', onDrop)}
		>
			{Array.from({ length: TOTAL_CELLS }, (_, i) => {
				const cellColor = gridState[i]?.color;
				const style = cellColor ? { ['--color' as any]: cellColor } : {};

				return (
					<button
						key={i}
						className="cell"
						data-index={i}
						role="gridcell"
						aria-label={`Cell ${i}`}
						style={style as React.CSSProperties}
					/>
				);
			})}
		</div>
	);
});

Grid.displayName = 'Grid';
