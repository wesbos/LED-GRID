import React from 'react';
import { useState, useEffect } from 'react';
import type { RoomInfo, RoomsInfoResponse, SwitchRoomResponse } from '../types';
import { UtilityPanel } from '../components/UtilityPanel';
import { AuthStatus } from '../components/AuthStatus';

export function AdminComponent() {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string>('default');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const response = await fetch('/party/parties/grid-server/default/admin/rooms');
      const data = await response.json() as RoomsInfoResponse;

      if (data.type === 'roomsInfo') {
        setRooms(data.rooms);
        // Update active room state
        const activeRoomInfo = data.rooms.find((r: RoomInfo) => r.isActive);
        if (activeRoomInfo) {
          setActiveRoom(activeRoomInfo.id);
        }
      }
    } catch (error) {
      console.error('Failed to load rooms:', error);
      showMessage('Failed to load rooms. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const switchRoom = async (roomId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/party/parties/grid-server/default/admin/switch-room?room=${roomId}`);
      const data = await response.json() as SwitchRoomResponse;

      if (data.success) {
        setActiveRoom(roomId); // Update local state immediately
        await loadRooms(); // Refresh the display
      }
    } catch (error) {
      console.error('Failed to switch room:', error);
      showMessage('Failed to switch room. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    if (type === 'success') {
      setTimeout(() => setMessage(null), 5000);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  // Navigation function
  const navigate = (window as any).navigate;

  const renderRoomCard = (room: RoomInfo) => {
    const isActive = room.isActive;
    const statusClass = isActive ? 'active' : 'inactive';
    const statusText = isActive ? 'Active' : 'Inactive';

    return (
      <div key={room.id} className={`room-card ${isActive ? 'active' : ''}`}>
        <div className="room-header">
          <div className="room-name">{room.id}</div>
          <div className={`room-status ${statusClass}`}>{statusText}</div>
        </div>

        <div className="room-stats">
          <div className="stat-item">
            <span className="stat-value">{room.connections}</span>
            <span className="stat-label">Connected Users</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{isActive ? '✓' : '○'}</span>
            <span className="stat-label">LED Display</span>
          </div>
        </div>

        <div className="room-actions">
          <button
            className="btn btn-primary"
            onClick={() => switchRoom(room.id)}
            disabled={isActive || loading}
          >
            {isActive ? 'Currently Active' : 'Switch to This Room'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/${room.id}`)}
          >
            View Room
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-container">
      <button
        className="back-link"
        onClick={() => navigate('/')}
      >
        ← Back to Grid
      </button>

      <div className="admin-header">
        <h1>🚦 LED Grid Admin</h1>
        <p>Manage which room is currently displayed on the LED hardware</p>
      </div>

      <AuthStatus />

      <UtilityPanel roomId={activeRoom} />

      <div className="refresh-section">
        <button
          className="refresh-btn"
          onClick={loadRooms}
          disabled={loading}
        >
          {loading ? '⏳ Loading...' : '🔄 Refresh Rooms'}
        </button>
      </div>

      {message && (
        <div className={`${message.type}-message`}>
          {message.text}
        </div>
      )}

      <div className="rooms-grid">
        {rooms.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#666' }}>
            <p>No rooms available yet.</p>
            <p>Create some rooms by visiting different URLs like <code>/room1</code>, <code>/room2</code>, etc.</p>
          </div>
        ) : (
          rooms.map(renderRoomCard)
        )}
      </div>
    </div>
  );
}
