import React, { useEffect, useRef, useState } from 'react';
import './Absolute.css';
import '../DeviceTypeHandler';

// Default values in case environment variables are not defined
const DEFAULT_NUM_ACTUATORS = 6;
const DEFAULT_INITIAL_AMPLITUDE = 10;
const DEFAULT_STEP_SIZE = 1.0;
const DEFAULT_ERRORS_ACCEPTED = 3;
const DEFAULT_PID = 0;

// Parse environment variables with fallbacks to default values
const NUM_ACTUATORS = process.env.REACT_APP_NUMBER_ACTUATOR ? parseInt(process.env.REACT_APP_NUMBER_ACTUATOR) : DEFAULT_NUM_ACTUATORS;
const INITIAL_AMPLITUDE = process.env.REACT_APP_INITIAL_AMPLITUDE ? parseInt(process.env.REACT_APP_INITIAL_AMPLITUDE) : DEFAULT_INITIAL_AMPLITUDE;
const INITIAL_STEP_SIZE = process.env.REACT_APP_STEP_RESOLUTION ? parseFloat(process.env.REACT_APP_STEP_RESOLUTION) : DEFAULT_STEP_SIZE;
const INITIAL_ERRORS_ACCEPTED = process.env.REACT_APP_REVERSAL ? parseInt(process.env.REACT_APP_REVERSAL) : DEFAULT_ERRORS_ACCEPTED;
const PID = process.env.REACT_APP_PID ? parseInt(process.env.REACT_APP_PID) : DEFAULT_PID;

const Experiment = () => {

  const [deviceType, setDeviceType] = useState('');
  const validDeviceTypes = ['necklace', 'overear', 'bracelet'];
  const off_amplitudes = [0,0,0,0,0,0];
  const [examinatorMode, setExaminatorMode] = useState(true);
  const [startAmplitude, setStartAmplitude] = useState(INITIAL_AMPLITUDE);
  const [stepSize, setStepSize] = useState(INITIAL_STEP_SIZE);
  // Fixed selected actuator instead of random
  const [selectedActuator, setSelectedActuator] = useState(0);
  
  // State for three-down-one-up procedure
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [reversalPoints, setReversalPoints] = useState(0);
  const [lastDirection, setLastDirection] = useState(null); // 'up' or 'down'

  const [bestAmplitude, setBestAmplitude] = useState(startAmplitude);
  const [currentAmplitude, setCurrentAmplitude] = useState(startAmplitude);
  const [trialData, setTrialData] = useState([]); // {amplitude, correct, timestamp} objects
  const [experimentStarted, setExperimentStarted] = useState(false);
  const [experimentEnded, setExperimentEnded] = useState(false);
  
  // Stimulus interval (first or second)
  const [stimulusInterval, setStimulusInterval] = useState(null); // 0 = first, 1 = second
  const [hasBeenPlayed, setHasBeenPlayed] = useState(false);

  const wsRef = useRef(null);

  // Handle start of experiment
  const handleStart = () => {
    // Randomly determine if stimulus is in first or second interval
    const interval = Math.random() < 0.5 ? 0 : 1; // 0 = first interval, 1 = second interval
    setStimulusInterval(interval);

    setBestAmplitude(startAmplitude);
    setExperimentStarted(true);
    setExperimentEnded(false);
    setExaminatorMode(false);
    setCurrentAmplitude(startAmplitude);
    setTrialData([]);
    setConsecutiveCorrect(0);
    setReversalPoints(0);
    setLastDirection(null);
    setHasBeenPlayed(false);
  };
  useEffect(() => {
    // Get device type from URL
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('DEVICE_TYPE');

    if (!deviceParam || !validDeviceTypes.includes(deviceParam.toLowerCase())) {
      console.error('Invalid or missing device type');
      return;
    }

    setDeviceType(deviceParam.toLowerCase());
  }, []);

  // Implement two-interval forced choice paradigm
  const handlePlay = () => {
    const timestamp = new Date().toISOString();
    const type = "PLAY_SIGNAL";

    // Use the selected actuator instead of random
    const actuator = selectedActuator;
    
    // Create stimulus amplitudes array - only the selected actuator has amplitude
    const stimulusAmplitudes = Array.from(
      { length: NUM_ACTUATORS }, 
      (_, i) => i === actuator ? currentAmplitude : 0
    );
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Sequence of messages to implement the two intervals:
      // 1. First interval (with or without stimulus)
      // 2. 200ms pause
      // 3. Second interval (with or without stimulus)
      
      // First interval
      let firstIntervalAmplitudes = stimulusInterval === 0 ? stimulusAmplitudes : off_amplitudes;
      let message1 = JSON.stringify({
        device: deviceType,
        amplitudes: firstIntervalAmplitudes,
        timestamp: Date.now(),
        duration: 1000
      });
      wsRef.current.send(message1);
      
      // Pause interval (200ms)
      let pauseMessage = JSON.stringify({
        device: deviceType,
        amplitudes: off_amplitudes,
        timestamp: Date.now(),
        duration: 200
      });
      wsRef.current.send(pauseMessage);
      
      // Second interval
      let secondIntervalAmplitudes = stimulusInterval === 1 ? stimulusAmplitudes : off_amplitudes;
      let message3 = JSON.stringify({
        device: deviceType,
        amplitudes: secondIntervalAmplitudes,
        timestamp: Date.now(),
        duration: 1000
      });
      wsRef.current.send(message3);
      
      // Mark as played
      setHasBeenPlayed(true);
    } else {
      console.log("Websocket not connected");
    }
  };

  const handleResponse = (selectedInterval) => {
    // Whether the response is correct (did they identify the stimulus interval correctly?)
    const correct = (selectedInterval === stimulusInterval);
    const timestamp = new Date().toISOString();
    const type = "GUESS";
    
    console.log("Response:", selectedInterval === 0 ? "First interval" : "Second interval");
    console.log("Actual stimulus:", stimulusInterval === 0 ? "First interval" : "Second interval");
    console.log("Correct:", correct);
    
    // Determine if we need to change direction (up/down) for tracking reversals
    let direction = null;
    let isReversal = false;
    
    // Apply the three-down one-up rule
    if (correct) {
      // Increment consecutive correct counter
      const newConsecutiveCorrect = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsecutiveCorrect);
      
      // If three consecutive correct, decrease amplitude
      if (newConsecutiveCorrect >= 3) {
        const newAmplitude = Math.round((currentAmplitude - stepSize) * 10) / 10;
        direction = 'down';
        
        // Check if this is a reversal
        if (lastDirection === 'up') {
          isReversal = true;
          setReversalPoints(prev => prev + 1);
        }
        
        // Update amplitude and reset consecutive correct counter
        setCurrentAmplitude(newAmplitude);
        setConsecutiveCorrect(0);
        
        // Update best amplitude if appropriate
        if (newAmplitude < bestAmplitude) {
          setBestAmplitude(newAmplitude);
        }
      }
    } else {
      // If incorrect, increase amplitude
      const newAmplitude = Math.round((currentAmplitude + stepSize) * 10) / 10;
      direction = 'up';
      
      // Check if this is a reversal
      if (lastDirection === 'down') {
        isReversal = true;
        setReversalPoints(prev => prev + 1);
      }
      
      // Update amplitude and reset consecutive correct counter
      setCurrentAmplitude(newAmplitude);
      setConsecutiveCorrect(0);
    }
    
    // Update last direction if we had a direction change
    if (direction) {
      setLastDirection(direction);
    }
    
    // Record trial data
    setTrialData(prev => [...prev, { 
      amplitude: currentAmplitude, 
      stimulusInterval, 
      selectedInterval,
      correct, 
      timestamp,
      isReversal,
      consecutiveCorrect: correct ? consecutiveCorrect + 1 : consecutiveCorrect,
      reversalNumber: isReversal ? reversalPoints + 1 : reversalPoints,
      type,
      device: deviceType
    }]);
    
    // Randomly determine stimulus interval for next trial (0 = first, 1 = second)
    const nextInterval = Math.random() < 0.5 ? 0 : 1;
    setStimulusInterval(nextInterval);
    
    // Check if we've reached 6 reversal points
    if (reversalPoints + (isReversal ? 1 : 0) >= 6) {
      alert("Staircase ended. 6 reversal points reached.");
      setExperimentEnded(true);
    }
    
    setHasBeenPlayed(false);
  };

  useEffect(() => {
    let ws;
    let connectionAttempts = 0;
    const maxAttempts = 3;
    const connectWebSocket = () => {
      try {
        ws = new WebSocket('ws://localhost:8000');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          connectionAttempts = 0; // Reset attempts on successful connection
        };

        ws.onmessage = (message) => {
          console.log('Received from server:', message.data);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed with code:', event.code);
          
          // If not a normal closure and within retry limits, attempt to reconnect
          if (event.code !== 1000 && event.code !== 1001 && connectionAttempts < maxAttempts) {
            connectionAttempts++;
            console.log(`Connection attempt ${connectionAttempts} of ${maxAttempts}...`);
            setTimeout(connectWebSocket, 2000); // Try to reconnect after 2 seconds
          } else if (connectionAttempts >= maxAttempts) {
            console.error('Maximum connection attempts reached. Please check server status.');
            alert('Could not connect to the WebSocket server. Please check if the server is running.');
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        
        if (connectionAttempts < maxAttempts) {
          connectionAttempts++;
          console.log(`Connection attempt ${connectionAttempts} of ${maxAttempts}...`);
          setTimeout(connectWebSocket, 2000);
        } else {
          console.error('Maximum connection attempts reached. Please check server status.');
          alert('Could not connect to the WebSocket server. Please check if the server is running.');
        }
      }
    };

    connectWebSocket();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Plot dimensions
  const plotWidth = 500;
  const plotHeight = 200;
  const padding = 30;

  // Calculate maximum and minimum amplitude
  const maxAmplitude = trialData.length > 0
    ? Math.max(...trialData.map(t => t.amplitude)) + 2 * stepSize
    : startAmplitude + stepSize;

  const minAmplitude = trialData.length > 0
    ? Math.min(...trialData.map(t => t.amplitude)) - 2 * stepSize
    : 0;

  // Generate coordinates for the plot
  const points = trialData.map((t, i) => {
    const x = trialData.length > 1
      ? padding + (i / (trialData.length - 1)) * (plotWidth - 2 * padding)
      : plotWidth / 2;
    const y = trialData.length > 1
      ? padding + ((maxAmplitude - t.amplitude) / (maxAmplitude - minAmplitude)) * (plotHeight - 2 * padding)
      : plotHeight / 2;

    return { x, y, correct: t.correct };
  });

  // String for polyline
  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  const handleSaveCSV = () => {
    // Convert trialData to CSV
    // CSV Headers
    const headers = [
      "Timestamp", 
      "Amplitude", 
      "StimulusInterval", 
      "SelectedInterval",
      "Correct", 
      "ConsecutiveCorrect",
      "IsReversal",
      "ReversalNumber",
      "Type"
    ];
    
    const rows = trialData.map(t => [
      t.timestamp, 
      t.amplitude, 
      t.stimulusInterval === 0 ? "First" : "Second", 
      t.selectedInterval === 0 ? "First" : "Second",
      t.correct,
      t.consecutiveCorrect,
      t.isReversal || false,
      t.reversalNumber || "",
      t.type
    ]);

    let csvContent = headers.join(",") + "\n";
    rows.forEach(r => {
      csvContent += r.join(",") + "\n";
    });

    //save on another page the project configuration
    const headers2 = ["Start Amplitude", "Step Size", "Selected Actuator", "Best Amplitude", "Total Reversals"];
    const rows2 = [[startAmplitude, stepSize, selectedActuator, bestAmplitude, reversalPoints]];

    csvContent += "\n\n" + headers2.join(",") + "\n";
    rows2.forEach(r => {
      csvContent += r.join(",") + "\n";
    });


    // Create a blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "absolute_threshold_data_" + String(PID) + ".csv";
    console.log(String(PID))
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
    <div className="deviceType">
      current device: {deviceType}
    </div>
      {/* Examinator mode toggle (always visible) */}
      <button className="examinatorToggle" onClick={() => setExaminatorMode(!examinatorMode)}>
        Examinator
      </button>

      {/* Main experiment view */}
      <div className="experimentArea">
        <div className="controlRow">
          {experimentStarted && !experimentEnded && (
            <button className="playButton" onClick={handlePlay}>Play</button>
          )}

          {experimentStarted && !experimentEnded && (
            <div className="responseButtonsContainer">
              {hasBeenPlayed && (
                <div className="responseButtons">
                  <p>Which interval contained the stimulus?</p>
                  <button className="responseButton" onClick={() => handleResponse(0)}>First Interval</button>
                  <button className="responseButton" onClick={() => handleResponse(1)}>Second Interval</button>
                </div>
              )}
            </div>
          )}

          {experimentEnded && (
            <div>
              <p>Experiment ended. Please save your data.</p>
              <button onClick={handleSaveCSV}>Save CSV</button>
            </div>
          )}
        </div>
      </div>

      {examinatorMode && (
        <div className="examinator">
          <div className="plotArea">
            <h3>Amplitude Response Plot</h3>
            <div className="plot">
              <svg width={plotWidth} height={plotHeight} style={{ border: '10px solid #ccc' }}>
                {/* Draw polyline if we have at least two points */}
                {points.length > 1 && (
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke="blue"
                    strokeWidth="2"
                  />
                )}
                {/* Draw circles for each data point */}
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill={p.correct ? 'green' : 'red'}
                    stroke="#000"
                    strokeWidth="1"
                  >
                    <title>{`Trial ${i + 1}: Amp=${trialData[i].amplitude}, ${p.correct ? 'Correct' : 'Incorrect'}`}</title>
                  </circle>
                ))}
                {/* Add a horizontal line for best amplitude */}
                {trialData.length > 0 && (
                  <line
                    x1={padding}
                    y1={
                      padding + ((maxAmplitude - bestAmplitude) / (maxAmplitude - minAmplitude)) * (plotHeight - 2 * padding)
                    }
                    x2={plotWidth - padding}
                    y2={
                      padding + ((maxAmplitude - bestAmplitude) / (maxAmplitude - minAmplitude)) * (plotHeight - 2 * padding)
                    }
                    stroke="orange"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                  />
                )}
                {/* Add text for best amplitude */}
                {trialData.length > 0 && (
                  <text
                    x={padding}
                    y={
                      padding + ((maxAmplitude - bestAmplitude) / (maxAmplitude - minAmplitude)) * (plotHeight - 2 * padding) - 10
                    }
                    fill="orange"
                    fontSize="12"
                  >
                    Best Amplitude: {bestAmplitude}
                  </text>
                )}
                {/* Add text for reversal points */}
                <text
                  x={plotWidth - padding}
                  y={padding / 2}
                  textAnchor="end"
                  fill="black"
                >
                  Reversals: {reversalPoints}/6
                </text>
                {/* Add text for consecutive correct */}
                <text
                  x={padding}
                  y={padding / 2}
                  textAnchor="start"
                  fill="black"
                >
                  Consecutive Correct: {consecutiveCorrect}/3
                </text>
              </svg>
            </div>
          </div>
          <div className="examinatorPanel">
            <h2>Examinator Mode</h2>
            <div className="inputGroup">
              <label>Start Amplitude:</label>
              <input
                type="number"
                step="0.01"
                value={startAmplitude}
                onChange={e => setStartAmplitude(parseFloat(e.target.value))}
              />
            </div>
            <div className="inputGroup">
              <label>Step:</label>
              <input
                type="number"
                step="0.01"
                value={stepSize}
                onChange={e => setStepSize(parseFloat(e.target.value))}
              />
            </div>
            <div className="inputGroup">
              <label>Selected Actuator:</label>
              <input
                type="number"
                min="0"
                max={NUM_ACTUATORS - 1}
                value={selectedActuator}
                onChange={e => setSelectedActuator(parseInt(e.target.value))}
              />
            </div>
            {!experimentStarted && (
              <button className="startButton" onClick={handleStart}>Start</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Experiment;