import * as React from 'react';
import { useState, useEffect } from 'react';

interface Utility {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface UtilityPanelProps {
  roomId: string;
}

export function UtilityPanel({ roomId }: UtilityPanelProps) {
  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [activeUtility, setActiveUtility] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);


  const loadUtilities = async () => {
    try {
      const response = await fetch(`/party/parties/grid-server/${roomId}/utilities/list`);
      const data = await response.json();

      if (data.type === 'utilitiesList') {
        setUtilities(data.utilities);
        setActiveUtility(data.activeUtility);
      }
    } catch (error) {
      console.error('Failed to load utilities:', error);
    }
  };

  const executeUtility = async (utilityId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/party/parties/grid-server/${roomId}/utilities/execute?utility=${utilityId}`);
      const result = await response.json();

      if (result.success) {
        setActiveUtility(utilityId);
      }
    } catch (error) {
      console.error('Failed to execute utility:', error);
    } finally {
      setLoading(false);
    }
  };

  const stopUtility = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/party/parties/grid-server/${roomId}/utilities/stop`);
      const result = await response.json();

      if (result.success) {
        setActiveUtility(null);
      }
    } catch (error) {
      console.error('Failed to stop utility:', error);
    } finally {
      setLoading(false);
    }
  };



  useEffect(() => {
    loadUtilities();
  }, [roomId]);

  return (
        <div className="utility-panel">
      <div className="utility-header">
        <h3>📊 Data Utilities</h3>
        <p className="utility-description">
          These utilities will display data on the currently active room: <strong>{roomId}</strong>
        </p>
        {activeUtility && (
          <button
            onClick={stopUtility}
            disabled={loading}
            className="stop-btn"
            title="Stop active utility"
          >
            ⏹️ Stop
          </button>
        )}
      </div>



      <div className="utility-grid">
        {utilities.map((utility) => (
          <button
            key={utility.id}
            className={`utility-btn ${activeUtility === utility.id ? 'active' : ''}`}
            onClick={() => executeUtility(utility.id)}
            disabled={loading}
            title={utility.description}
          >
            <span className="utility-icon">{utility.icon}</span>
            <span className="utility-name">{utility.name}</span>
          </button>
        ))}
      </div>

      {activeUtility && (
        <div className="active-utility-info">
          <span>🔄 Active: {utilities.find(u => u.id === activeUtility)?.name}</span>
        </div>
      )}
    </div>
  );
}
