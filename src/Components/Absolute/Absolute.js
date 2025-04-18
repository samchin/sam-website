import React, { useEffect, useRef, useState } from 'react';
import './Absolute.css';
import '../DeviceTypeHandler';

// Default values in case environment variables are not defined
const DEFAULT_NUM_ACTUATORS = 6;
const DEFAULT_STEP_INDEX = 1; 
const DEFAULT_ERRORS_ACCEPTED = 3;
const DEFAULT_PID = 0;

// Parse environment variables with fallbacks to default values
const NUM_ACTUATORS = process.env.REACT_APP_NUMBER_ACTUATOR ? parseInt(process.env.REACT_APP_NUMBER_ACTUATOR) : DEFAULT_NUM_ACTUATORS;
const INITIAL_STEP_INDEX = DEFAULT_STEP_INDEX;
const INITIAL_ERRORS_ACCEPTED = DEFAULT_ERRORS_ACCEPTED;
const PID = process.env.REACT_APP_PID ? parseInt(process.env.REACT_APP_PID) : DEFAULT_PID;

//  function for calculating step size
function logStaircase(index) {
  // Starting value (initial amplitude)
  const startValue = 0.5;
  
  // Reference value for conversion to dB (can be the same as startValue)
  const referenceValue = 0.5;
  
  // Log step size in dB (typical values range from 1-3 dB)
  const stepSizeDB = 3.0;
  
  // Convert to dB space, apply step reduction, convert back to linear
  // In dB space: each step reduces by stepSizeDB
  const levelInDB = 20 * Math.log10(startValue / referenceValue) - (index * stepSizeDB);
  
  // Convert back to linear units
  return referenceValue * Math.pow(10, levelInDB / 20);
}
const Experiment = () => {

  const [customPID, setCustomPID] = useState(String(PID));
  const [deviceType, setDeviceType] = useState('');
  const validDeviceTypes = ['necklace', 'overear', 'bracelet'];
  const off_amplitudes = [0,0,0,0,0,0];
  const [examinatorMode, setExaminatorMode] = useState(true);
  // Define initial amplitude based on step index rather than having a separate state
  const [stepIndex, setStepIndex] = useState(INITIAL_STEP_INDEX);

  // Track current actuator for cycling through all actuators
  const [selectedActuator, setSelectedActuator] = useState(0);
  const [currentActuatorIndex, setCurrentActuatorIndex] = useState(0);
  
  // State for three-down-one-up procedure
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [reversalPoints, setReversalPoints] = useState(0);
  const [lastDirection, setLastDirection] = useState(null); // 'up' or 'down'

  // State for tracking amplitudes and steps
  const [bestAmplitude, setBestAmplitude] = useState(logStaircase(INITIAL_STEP_INDEX));
  const [currentAmplitude, setCurrentAmplitude] = useState(logStaircase(INITIAL_STEP_INDEX));
  const [currentStepIndex, setCurrentStepIndex] = useState(INITIAL_STEP_INDEX);
  const [trialData, setTrialData] = useState([]); // {amplitude, correct, timestamp} objects
  const [experimentStarted, setExperimentStarted] = useState(false);
  const [experimentEnded, setExperimentEnded] = useState(false);
  
  // Stimulus interval (first or second)
  const [stimulusInterval, setStimulusInterval] = useState(null); // 0 = first, 1 = second
  const [hasBeenPlayed, setHasBeenPlayed] = useState(false);
  
  // Visual indicators for intervals
  const [firstIntervalActive, setFirstIntervalActive] = useState(false);
  const [secondIntervalActive, setSecondIntervalActive] = useState(false);
  const [intervalGap, setIntervalGap] = useState(false);

  const wsRef = useRef(null);

  // Handle start of experiment
  const handleStart = () => {
    // Randomly determine if stimulus is in first or second interval
    const interval = Math.random() < 0.5 ? 0 : 1; // 0 = first interval, 1 = second interval
    setStimulusInterval(interval);

    // Start with the first actuator
    setCurrentActuatorIndex(0);
    
    // Initialize amplitude using logStaircase and the starting step index
    const initialAmplitude = logStaircase(stepIndex);
    
    setBestAmplitude(initialAmplitude);
    setExperimentStarted(true);
    setExperimentEnded(false);
    setExaminatorMode(false);
    setCurrentAmplitude(initialAmplitude);
    setCurrentStepIndex(stepIndex);
    setTrialData([]);
    setConsecutiveCorrect(0);
    setReversalPoints(0);
    setLastDirection(null);
    setHasBeenPlayed(false);
  };
  
  useEffect(() => {
    // Get device type and PID from URL
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('DEVICE_TYPE');
    const pidParam = params.get('PID');

    if (!deviceParam || !validDeviceTypes.includes(deviceParam.toLowerCase())) {
      console.error('Invalid or missing device type');
      return;
    }

    setDeviceType(deviceParam.toLowerCase());
    
    // Set PID from URL parameter if it exists
    if (pidParam) {
      setCustomPID(pidParam);
      console.log(`PID set from URL: ${pidParam}`);
    }
  }, []);

  // Implement two-interval forced choice paradigm
  const handlePlay = () => {
    if (!experimentStarted || experimentEnded || hasBeenPlayed) return;
    
    const timestamp = new Date().toISOString();
    const type = "PLAY_SIGNAL";

    // Use the current actuator from the cycling sequence // NEW :ROTATED
    const actuator = (currentActuatorIndex + 2) % NUM_ACTUATORS;
    
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
      setFirstIntervalActive(true);
      setSecondIntervalActive(false);
      setIntervalGap(false);
      
      let firstIntervalAmplitudes = stimulusInterval === 0 ? stimulusAmplitudes : off_amplitudes;
      let message1 = JSON.stringify({
        device: deviceType,
        amplitudes: firstIntervalAmplitudes,
        timestamp: Date.now(),
        duration: 1000
      });
      wsRef.current.send(message1);
      
      // Schedule visual indicator changes for intervals
      setTimeout(() => {
        setFirstIntervalActive(false);
        setIntervalGap(true);
        
        // Pause interval (200ms)
        let pauseMessage = JSON.stringify({
          device: deviceType,
          amplitudes: off_amplitudes,
          timestamp: Date.now(),
          duration: 200
        });
        wsRef.current.send(pauseMessage);
        
        // Second interval after gap
        setTimeout(() => {
          setIntervalGap(false);
          setSecondIntervalActive(true);
          
          let secondIntervalAmplitudes = stimulusInterval === 1 ? stimulusAmplitudes : off_amplitudes;
          let message3 = JSON.stringify({
            device: deviceType,
            amplitudes: secondIntervalAmplitudes,
            timestamp: Date.now(),
            duration: 1000
          });
          wsRef.current.send(message3);
          
          // Reset visual indicators after second interval
          setTimeout(() => {
            setSecondIntervalActive(false);
            setHasBeenPlayed(true);
          }, 1000);
        }, 200);
      }, 1000);
    } else {
      console.log("Websocket not connected");
    }
  };

  const handleResponse = (selectedInterval) => {
    if (!experimentStarted || experimentEnded || !hasBeenPlayed) return;
    
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
    
    // Apply the two-down one-up rule
    if (correct) {
      // Increment consecutive correct counter
      const newConsecutiveCorrect = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsecutiveCorrect);
      
      // If three consecutive correct, decrease amplitude
      if (newConsecutiveCorrect >= 2) {
        // Move to next step index
        const newStepIndex = currentStepIndex + 1;
        // Set amplitude directly to the output of logStaircase for the new step index
        const newAmplitude = logStaircase(newStepIndex);
        
        direction = 'down';
        
        // Check if this is a reversal
        if (lastDirection === 'up') {
          isReversal = true;
          setReversalPoints(prev => prev + 1);
        }
        
        // Update amplitude, step index, and reset consecutive correct counter
        setCurrentAmplitude(newAmplitude);
        setCurrentStepIndex(newStepIndex);
        setConsecutiveCorrect(0);
        
        // Update best amplitude if appropriate
        if (newAmplitude < bestAmplitude) {
          setBestAmplitude(newAmplitude);
        }
      }
    } else {
      // If incorrect, decrease step index (to return to previous step size)
      // Ensure step index doesn't go below 0
      const newStepIndex = Math.max(0, currentStepIndex - 1);
      // Set amplitude directly to the output of logStaircase for this step index
      const newAmplitude = logStaircase(newStepIndex);
      
      direction = 'up';
      
      // Check if this is a reversal
      if (lastDirection === 'down') {
        isReversal = true;
        setReversalPoints(prev => prev + 1);
      }
      
      // Update amplitude, step index, and reset consecutive correct counter
      setCurrentAmplitude(newAmplitude);
      setCurrentStepIndex(newStepIndex);
      setConsecutiveCorrect(0);
    }
    
    // Update last direction if we had a direction change
    if (direction) {
      setLastDirection(direction);
    }
    
    // Record trial data with actuator information
    setTrialData(prev => [...prev, { 
      amplitude: currentAmplitude, 
      stimulusInterval, 
      selectedInterval,
      correct, 
      timestamp,
      isReversal,
      consecutiveCorrect: correct ? consecutiveCorrect + 1 : consecutiveCorrect,
      reversalNumber: isReversal ? reversalPoints + 1 : reversalPoints,
      stepIndex: currentStepIndex,
      type,
      device: deviceType,
      actuator: currentActuatorIndex  // Add the current actuator to the trial data
    }]);
    
    // Randomly determine stimulus interval for next trial (0 = first, 1 = second)
    const nextInterval = Math.random() < 0.5 ? 0 : 1;
    setStimulusInterval(nextInterval);
    
    // Check if we've reached 6 reversal points
    if (reversalPoints + (isReversal ? 1 : 0) >= 6) {
      // Cycle to the next actuator
      const nextActuatorIndex = (currentActuatorIndex + 1) % NUM_ACTUATORS;
      setCurrentActuatorIndex(nextActuatorIndex);
      
      // Reset for new actuator
      if (nextActuatorIndex === 0) {
        alert("Experiment ended. All actuators have been tested.");
        setExperimentEnded(true);
      } else {
        // Otherwise, start a new staircase with the next actuator
        alert(`Staircase for actuator ${currentActuatorIndex} completed with 6 reversal points. Starting actuator ${nextActuatorIndex}.`);
        setSelectedActuator(nextActuatorIndex);
        
        // FIXED: Reset amplitude to initial value based on starting step index
        const initialAmplitude = logStaircase(stepIndex);
        setCurrentAmplitude(initialAmplitude);
        setCurrentStepIndex(stepIndex);
        setBestAmplitude(prev => Math.min(prev, initialAmplitude)); // Keep best amplitude across actuators
        
        setConsecutiveCorrect(0);
        setReversalPoints(0);
        setLastDirection(null);
      }
    }
    
    setHasBeenPlayed(false);
  };

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Prevent default actions for these keys
      if (event.key === ' ' || event.key === '[' || event.key === ']') {
        event.preventDefault();
      }
      
      // Handle space bar press - Play
      if (event.key === ' ' && experimentStarted && !experimentEnded && !hasBeenPlayed) {
        handlePlay();
      }
      
      // Handle [ key press - First Interval
      if (event.key === '[' && experimentStarted && !experimentEnded && hasBeenPlayed) {
        handleResponse(0);
      }
      
      // Handle ] key press - Second Interval
      if (event.key === ']' && experimentStarted && !experimentEnded && hasBeenPlayed) {
        handleResponse(1);
      }
    };
    
    // Add keyboard event listener
    window.addEventListener('keydown', handleKeyPress);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [experimentStarted, experimentEnded, hasBeenPlayed, stimulusInterval, currentStepIndex]);

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

  // Calculate maximum and minimum amplitude for log scale
  // Prevent log(0) by using a small positive value for minimum
  const epsilon = 0.0001;
  
  // Get amplitude values from trial data, with fallbacks
  const initialAmplitude = logStaircase(stepIndex);
  const amplitudeValues = trialData.length > 0
    ? trialData.map(t => Math.max(t.amplitude, epsilon))
    : [Math.max(initialAmplitude, epsilon)];
  
  // Add padding to max/min for display purposes
  const maxAmplitude = trialData.length > 0
    ? Math.max(...amplitudeValues) * 1.5 
    : initialAmplitude * 1.5;
    
  const minAmplitude = trialData.length > 0
    ? Math.min(...amplitudeValues) / 1.5
    : Math.max(initialAmplitude / 4, epsilon);
  
  // Log scale transformations
  const logMin = Math.log(minAmplitude);
  const logMax = Math.log(maxAmplitude);
  const logRange = logMax - logMin;
  
  // Generate coordinates for the plot (log scale for y-axis)
  const points = trialData.map((t, i) => {
    const x = trialData.length > 1
      ? padding + (i / (trialData.length - 1)) * (plotWidth - 2 * padding)
      : plotWidth / 2;
      
    // Log scale for y-axis: map log(amplitude) to pixel coordinates
    const logAmplitude = Math.log(Math.max(t.amplitude, epsilon));
    const normalizedLogValue = (logMax - logAmplitude) / logRange;
    const y = padding + normalizedLogValue * (plotHeight - 2 * padding);
    
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
      "StepIndex",
      "Type",
      "Actuator",
      "DeviceType",
      "PID"
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
      t.stepIndex,
      t.type,
      t.actuator,
      deviceType,
      customPID
    ]);

    let csvContent = headers.join(",") + "\n";
    rows.forEach(r => {
      csvContent += r.join(",") + "\n";
    });

    //save on another page the project configuration
    const headers2 = ["Starting Step Index", "Initial Amplitude", "Selected Actuator", "Best Amplitude", "DeviceType", "PID"];
    const rows2 = [[stepIndex, logStaircase(stepIndex), selectedActuator, bestAmplitude, deviceType, customPID]];

    csvContent += "\n\n" + headers2.join(",") + "\n";
    rows2.forEach(r => {
      csvContent += r.join(",") + "\n";
    });

    // Include extra metadata at the top of the file
    const metadataHeaders = ["DeviceType", "PID"];
    const metadataRows = [[deviceType, customPID]];
    
    let finalCsvContent = metadataHeaders.join(",") + "\n";
    metadataRows.forEach(r => {
      finalCsvContent += r.join(",") + "\n";
    });
    
    finalCsvContent += "\n" + csvContent;

    // Create a blob and trigger download with device type in the filename
    const blob = new Blob([finalCsvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Include device type and PID in the filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `absolute_threshold_${deviceType}_pid${customPID}_${timestamp}.csv`;
    console.log(`Saving data for ${deviceType} with PID ${customPID}`);
    a.click();
    URL.revokeObjectURL(url);
  };

  // We no longer need handleAmplitudeChange since amplitude is determined by step index

  const handleStepIndexChange = (e) => {
    const value = e.target.value;
    if (value === '' || isNaN(parseInt(value))) {
      setStepIndex('');
    } else {
      setStepIndex(parseInt(value));
    }
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
      
      {/* Save CSV button - Now always visible */}
      <div className="dataExportControls">
        <button 
          className="saveCSVButton" 
          onClick={handleSaveCSV}
        >
          Save CSV
        </button>
        
        <div className="pidInputContainer">
          <label htmlFor="pidInput">Participant ID:</label>
          <input
            id="pidInput"
            type="text"
            value={customPID}
            onChange={(e) => setCustomPID(e.target.value)}
            className="pidInput"
          />
        </div>
      </div>

      {/* Main experiment view */}
      <div className="experimentArea">
        {/* Interval Visual Indicators */}
        <div className="intervalIndicators">
          <div className={`intervalIndicator ${firstIntervalActive ? 'active' : ''}`}>
            <div className="indicatorLabel">First Interval</div>
          </div>
          <div className={`intervalGap ${intervalGap ? 'active' : ''}`}>
            <div className="indicatorLabel">Gap</div>
          </div>
          <div className={`intervalIndicator ${secondIntervalActive ? 'active' : ''}`}>
            <div className="indicatorLabel">Second Interval</div>
          </div>
        </div>
      
        <div className="controlRow">
          {experimentStarted && !experimentEnded && !hasBeenPlayed && !firstIntervalActive && !secondIntervalActive && !intervalGap && (
            <button 
              className="playButton" 
              onClick={handlePlay}>
              Play <span className="keyboardShortcut">(Space)</span>
            </button>
          )}

          {experimentStarted && !experimentEnded && (
            <div className="responseButtonsContainer">
              {hasBeenPlayed && (
                <div className="responseButtons">
                  <p>Which interval contained the stimulus?</p>
                  <button className="responseButton" onClick={() => handleResponse(0)}>
                    First Interval <span className="keyboardShortcut">([)</span>
                  </button>
                  <button className="responseButton" onClick={() => handleResponse(1)}>
                    Second Interval <span className="keyboardShortcut">(])</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {experimentEnded && (
            <div>
              <p>Experiment ended.</p>
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
                    <title>{`Trial ${i + 1}: Amp=${trialData[i].amplitude}, ${p.correct ? 'Correct' : 'Incorrect'}, Step Index=${trialData[i].stepIndex}`}</title>
                  </circle>
                ))}
                {/* Add a horizontal line for best amplitude with log scale */}
                {trialData.length > 0 && (
                  <line
                    x1={padding}
                    y1={
                      padding + ((logMax - Math.log(Math.max(bestAmplitude, epsilon))) / logRange) * (plotHeight - 2 * padding)
                    }
                    x2={plotWidth - padding}
                    y2={
                      padding + ((logMax - Math.log(Math.max(bestAmplitude, epsilon))) / logRange) * (plotHeight - 2 * padding)
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
                      padding + ((logMax - Math.log(Math.max(bestAmplitude, epsilon))) / logRange) * (plotHeight - 2 * padding) - 10
                    }
                    fill="orange"
                    fontSize="12"
                  >
                    Best Amplitude: {bestAmplitude.toFixed(4)}
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
                {/* Add y-axis labels for log scale */}
                {[0.1, 0.25, 0.5, 1].map(value => {
                  if (value >= minAmplitude && value <= maxAmplitude) {
                    const logValue = Math.log(value);
                    const y = padding + ((logMax - logValue) / logRange) * (plotHeight - 2 * padding);
                    return (
                      <g key={value}>
                        <line 
                          x1={padding - 5} 
                          y1={y} 
                          x2={padding} 
                          y2={y} 
                          stroke="black" 
                          strokeWidth="1" 
                        />
                        <text 
                          x={padding - 8} 
                          y={y + 4} 
                          textAnchor="end" 
                          fontSize="10"
                        >
                          {value}
                        </text>
                      </g>
                    );
                  }
                  return null;
                })}
                <text
                  x={padding - 15}
                  y={padding - 15}
                  textAnchor="middle"
                  transform={`rotate(-90, ${padding - 15}, ${plotHeight/2})`}
                  fontSize="12"
                >
                  Amplitude (log scale)
                </text>
                
                {/* Add text for current step index and size */}
                <text
                  x={padding}
                  y={plotHeight - padding / 4}
                  textAnchor="start"
                  fill="black"
                >
                  Step Index: {currentStepIndex}, Current Step Size: {logStaircase(currentStepIndex).toFixed(4)}
                </text>
              </svg>
            </div>
          </div>
          <div className="examinatorPanel">
            <h2>Examinator Mode</h2>
            <div className="inputGroup">
              <label>Starting Step Index:</label>
              <input
                type="number"
                value={stepIndex}
                onChange={handleStepIndexChange}
                min="0"
                step="1"
              />
            </div>
            <div className="inputGroup">
              <label>Initial Amplitude: {logStaircase(stepIndex).toFixed(4)}</label>
            </div>
            <div className="inputGroup">
              <label>Starting Actuator:</label>
              <input
                type="number"
                min="0"
                max={NUM_ACTUATORS - 1}
                value={currentActuatorIndex}
                onChange={e => setCurrentActuatorIndex(parseInt(e.target.value))}
              />
            </div>
            <div className="inputGroup">
              <label>Current Actuator: {currentActuatorIndex}</label>
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