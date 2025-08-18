import * as React from 'react';
import { GridEditor } from '../components/GridEditor';

interface RoomComponentProps {
	roomId: string;
}

export function RoomComponent({ roomId }: RoomComponentProps) {
	return <GridEditor roomId={roomId} showRoomInfo={true} />;
}
