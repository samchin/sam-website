import React, { useState, useEffect, useRef } from 'react';
import './AmplitudeInput.css';

const AmplitudeInput = ({ deviceType = '' }) => {
  const NUM_ACTUATORS = parseInt(process.env.REACT_APP_NUMBER_ACTUATOR) || 6;
  const UPDATE_INTERVAL = parseInt(process.env.REACT_APP_SENDING_RATE) || 100; // ms
  
  const [amplitudes, setAmplitudes] = useState(Array(NUM_ACTUATORS).fill(0));
  const [duration, setDuration] = useState(100); // Default duration in ms
  const [sendingActive, setSendingActive] = useState(false);
  const wsRef = useRef(null);
  const intervalRef = useRef(null);
  
  // Connect to WebSocket on component mount
  useEffect(() => {
    const connectWebSocket = () => {
      // Close existing connection if it exists
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (err) {
          console.error("Error closing existing WebSocket:", err);
        }
      }
      
      // Create new connection
      const ws = new WebSocket('ws://localhost:8000');
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected in AmplitudeInput');
      };
      
      ws.onmessage = (message) => {
        console.log('Received from server:', message.data);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket closed, code:', event.code, 'reason:', event.reason);
        
        // If we were actively sending and the connection closed unexpectedly, try to reconnect
        if (sendingActive && !event.wasClean) {
          console.log('Attempting to reconnect WebSocket...');
          setTimeout(connectWebSocket, 1000); // Reconnect after 1 second
        }
      };
      
      return ws;
    };
    
    const ws = connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      // Stop sending if active
      if (sendingActive && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        // We don't call setSendingActive(false) during cleanup to avoid React state updates
      }
      
      // Close WebSocket
      if (ws) {
        try {
          ws.close();
        } catch (err) {
          console.error("Error closing WebSocket during cleanup:", err);
        }
      }
    };
  }, [sendingActive]);
  
  // Handle amplitude changes
  const handleAmplitudeChange = (index, value) => {
    const newAmplitudes = [...amplitudes];
    // Ensure the value is between 0 and 1
    newAmplitudes[index] = Math.max(0, Math.min(1, value));
    setAmplitudes(newAmplitudes);
  };
  
  // Handle duration change
  const handleDurationChange = (value) => {
    setDuration(Math.max(10, value)); // Minimum duration of 10ms
  };
  
  // Send a single amplitude update
  const sendAmplitudes = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        device: deviceType,
        amplitudes: amplitudes,
        timestamp: Date.now(),
        duration: duration
      });
      wsRef.current.send(message);
      console.log("Sent amplitude data:", message);
      return true;
    }
    console.warn("WebSocket not open, couldn't send data");
    return false;
  };
  
  // Toggle sending data
  const toggleSending = () => {
    // If already active, stop sending first
    if (sendingActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setSendingActive(false);
      console.log("Stopped continuous sending");
    } else {
      // Clear any existing interval first as a safety measure
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      // Start a new sending interval
      const newInterval = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          sendAmplitudes();
        } else {
          console.warn("WebSocket disconnected during continuous sending");
          // Attempt reconnection
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            wsRef.current = new WebSocket('ws://localhost:8000');
            wsRef.current.onopen = () => console.log("WebSocket reconnected");
          }
        }
      }, UPDATE_INTERVAL);
      
      intervalRef.current = newInterval;
      setSendingActive(true);
      console.log("Started continuous sending with interval", UPDATE_INTERVAL);
    }
  };
  
  // Send a single packet (manual send)
  const sendSinglePacket = () => {
    sendAmplitudes();
  };
  
  // Preset patterns
  const presets = {
    allOff: Array(NUM_ACTUATORS).fill(0),
    allOn: Array(NUM_ACTUATORS).fill(1),
    alternating: Array(NUM_ACTUATORS).fill(0).map((_, i) => i % 2 === 0 ? 1 : 0),
    gradient: Array(NUM_ACTUATORS).fill(0).map((_, i) => i / (NUM_ACTUATORS - 1))
  };
  
  const applyPreset = (presetName) => {
    if (presets[presetName]) {
      setAmplitudes([...presets[presetName]]);
    }
  };
  
  // Add safeguards for WebSocket connection status
  useEffect(() => {
    // Check WebSocket status every 5 seconds
    const checkConnection = setInterval(() => {
      if (sendingActive) {
        // If we're supposed to be sending but WebSocket is closed or closing
        if (!wsRef.current || wsRef.current.readyState >= 2) {
          console.log("WebSocket disconnected while sending active, reconnecting...");
          // Try to reconnect
          const ws = new WebSocket('ws://localhost:8000');
          wsRef.current = ws;
          
          ws.onopen = () => {
            console.log('WebSocket reconnected');
          };
          
          ws.onerror = (error) => {
            console.error('WebSocket reconnection error:', error);
          };
        }
      }
    }, 5000);
    
    return () => {
      clearInterval(checkConnection);
      // Additional cleanup is already handled in the WebSocket effect
    };
  }, [sendingActive]);
  
  return (
    <div className="amplitude-input-panel">
      <h2>Amplitude Control Panel</h2>
      <div className="device-info">
        <span>Device: {deviceType || 'Not specified'}</span>
      </div>
      
      <div className="sliders-container">
        {amplitudes.map((value, index) => (
          <div key={index} className="slider-group">
            <label>Motor {index + 1}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={value}
              onChange={(e) => handleAmplitudeChange(index, parseFloat(e.target.value))}
            />
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={value.toFixed(2)}
              onChange={(e) => handleAmplitudeChange(index, parseFloat(e.target.value))}
            />
          </div>
        ))}
      </div>
      
      <div className="duration-control">
        <label>Duration (ms): </label>
        <input
          type="number"
          min="10"
          step="10"
          value={duration}
          onChange={(e) => handleDurationChange(parseInt(e.target.value))}
        />
      </div>
      
      <div className="control-buttons">
        <button 
          onClick={sendSinglePacket}
          className="send-button"
        >
          Send Once
        </button>
        
        <button 
          onClick={toggleSending}
          className={`toggle-button ${sendingActive ? 'active' : ''}`}
          disabled={!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN}
        >
          {sendingActive ? 'Stop Sending' : 'Start Continuous Send'}
        </button>
        {(!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) && 
          <div className="connection-warning">WebSocket disconnected. Reconnecting...</div>
        }
      </div>
      
      <div className="presets">
        <h3>Presets</h3>
        <div className="preset-buttons">
          <button onClick={() => applyPreset('allOff')}>All Off</button>
          <button onClick={() => applyPreset('allOn')}>All On</button>
          <button onClick={() => applyPreset('alternating')}>Alternating</button>
          <button onClick={() => applyPreset('gradient')}>Gradient</button>
        </div>
      </div>
      
      <div className="amplitude-display">
        <h3>Current Values</h3>
        <pre>{JSON.stringify(amplitudes.map(a => a.toFixed(2)), null, 2)}</pre>
      </div>
    </div>
  );
};

export default AmplitudeInput;