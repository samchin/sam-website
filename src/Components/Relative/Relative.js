import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Relative.css';
import '../DeviceTypeHandler';

// Default values in case environment variables are not defined
const DEFAULT_NUM_ACTUATORS = 6;
const DEFAULT_REFERENCE_AMPLITUDE = 10; // Reference amplitude
const DEFAULT_INITIAL_DIFFERENCE = 5;   // Initial difference between reference and test
const DEFAULT_STEP_SIZE = 0.33;         // Step size in dB as specified
const DEFAULT_ERRORS_ACCEPTED = 3;
const DEFAULT_PID = 0;

// Parse environment variables with fallbacks to default values
const NUM_ACTUATORS = process.env.REACT_APP_NUMBER_ACTUATOR ? parseInt(process.env.REACT_APP_NUMBER_ACTUATOR) : DEFAULT_NUM_ACTUATORS;
const REFERENCE_AMPLITUDE = process.env.REACT_APP_REFERENCE_AMPLITUDE ? parseInt(process.env.REACT_APP_REFERENCE_AMPLITUDE) : DEFAULT_REFERENCE_AMPLITUDE;
const INITIAL_DIFFERENCE = process.env.REACT_APP_INITIAL_DIFFERENCE ? parseInt(process.env.REACT_APP_INITIAL_DIFFERENCE) : DEFAULT_INITIAL_DIFFERENCE;
const INITIAL_STEP_SIZE = process.env.REACT_APP_STEP_RESOLUTION ? parseFloat(process.env.REACT_APP_STEP_RESOLUTION) : DEFAULT_STEP_SIZE;
const INITIAL_ERRORS_ACCEPTED = process.env.REACT_APP_REVERSAL ? parseInt(process.env.REACT_APP_REVERSAL) : DEFAULT_ERRORS_ACCEPTED;
const PID = process.env.REACT_APP_PID ? parseInt(process.env.REACT_APP_PID) : DEFAULT_PID;

// Helper function to convert between linear amplitude and dB
const linearToDB = (linear) => 20 * Math.log10(linear);
const dBToLinear = (dB) => Math.pow(10, dB / 20);

const Experiment = () => {
  const [deviceType, setDeviceType] = useState('');
  const validDeviceTypes = ['necklace', 'overear', 'bracelet'];
  const off_amplitudes = [0,0,0,0,0,0];
  const [examinatorMode, setExaminatorMode] = useState(true);
  
  // State for reference stimulus
  const [referenceAmplitude, setReferenceAmplitude] = useState(REFERENCE_AMPLITUDE);
  
  // State for difference threshold
  const [currentDifference, setCurrentDifference] = useState(INITIAL_DIFFERENCE);
  const [stepSize, setStepSize] = useState(INITIAL_STEP_SIZE);
  
  // Track current actuator for cycling through all actuators
  const [selectedActuator, setSelectedActuator] = useState(0);
  const [currentActuatorIndex, setCurrentActuatorIndex] = useState(0);
  
  // State for three-down-one-up procedure
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [reversalPoints, setReversalPoints] = useState(0);
  const [lastDirection, setLastDirection] = useState(null); // 'up' or 'down'

  const [bestDifference, setBestDifference] = useState(INITIAL_DIFFERENCE);
  const [trialData, setTrialData] = useState([]); // {referenceAmplitude, testAmplitude, difference, correct, timestamp} objects
  const [experimentStarted, setExperimentStarted] = useState(false);
  const [experimentEnded, setExperimentEnded] = useState(false);
  
  // Interval where the higher amplitude stimulus is presented (reference is always the same)
  const [higherInterval, setHigherInterval] = useState(null); // 0 = first, 1 = second
  const [hasBeenPlayed, setHasBeenPlayed] = useState(false);
  
  // Visual indicators for intervals
  const [firstIntervalActive, setFirstIntervalActive] = useState(false);
  const [secondIntervalActive, setSecondIntervalActive] = useState(false);
  const [intervalGap, setIntervalGap] = useState(false);
  
  // Added state for errors accepted
  const [errorsAccepted] = useState(INITIAL_ERRORS_ACCEPTED);
  
  // Track if we should present equal stimuli (for false positive testing)
  const [equalStimuli, setEqualStimuli] = useState(false);

  const wsRef = useRef(null);

  // Handle start of experiment
  const handleStart = () => {
    // Randomly determine if higher stimulus is in first or second interval
    const interval = Math.random() < 0.5 ? 0 : 1; // 0 = first interval, 1 = second interval
    setHigherInterval(interval);
    
    // Decide if this is a trial with equal stimuli (10% chance as per requirement)
    const isEqualStimuliTrial = Math.random() < 0.1;
    setEqualStimuli(isEqualStimuliTrial);

    // Start with the first actuator
    setCurrentActuatorIndex(0);
    
    setBestDifference(INITIAL_DIFFERENCE);
    setExperimentStarted(true);
    setExperimentEnded(false);
    setExaminatorMode(false);
    setCurrentDifference(INITIAL_DIFFERENCE);
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
  }, [validDeviceTypes]);

  // Implement two-interval forced choice paradigm - converted to useCallback
  const handlePlay = useCallback(() => {
    if (!experimentStarted || experimentEnded) return;
    
    // If currently playing, don't allow replaying
    if (firstIntervalActive || secondIntervalActive || intervalGap) return;
    
    const currentTimestamp = new Date().toISOString();
    const actionType = "PLAY_SIGNAL";

    // Use the current actuator from the cycling sequence
    const actuator = currentActuatorIndex;
    
    // Calculate test amplitude based on reference and difference
    // In equal stimuli trials, test = reference
    const testAmplitude = equalStimuli ? referenceAmplitude : referenceAmplitude + currentDifference;
    
    // Create reference and test stimulus amplitudes arrays - only the selected actuator has amplitude
    const referenceAmplitudes = Array.from(
      { length: NUM_ACTUATORS }, 
      (_, i) => i === actuator ? referenceAmplitude : 0
    );
    
    const testAmplitudes = Array.from(
      { length: NUM_ACTUATORS }, 
      (_, i) => i === actuator ? testAmplitude : 0
    );
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // First interval
      setFirstIntervalActive(true);
      setSecondIntervalActive(false);
      setIntervalGap(false);
      
      // Determine which amplitude to use in which interval
      let firstIntervalAmplitudes = higherInterval === 0 ? testAmplitudes : referenceAmplitudes;
      let message1 = JSON.stringify({
        device: deviceType,
        amplitudes: firstIntervalAmplitudes,
        timestamp: Date.now(),
        duration: 1000,
        messageType: actionType,
        logTimestamp: currentTimestamp
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
          
          let secondIntervalAmplitudes = higherInterval === 1 ? testAmplitudes : referenceAmplitudes;
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
  }, [experimentStarted, experimentEnded, firstIntervalActive, secondIntervalActive, 
      intervalGap, currentActuatorIndex, currentDifference, higherInterval, 
      referenceAmplitude, equalStimuli, off_amplitudes, deviceType]);

  const handleResponse = useCallback((response) => {
    if (!experimentStarted || experimentEnded || !hasBeenPlayed) return;
    
    // For relative threshold, response is whether stimuli are different
    // true = "Different", false = "Same"
    
    // Determine correct answer based on equal stimuli flag
    const correctAnswer = !equalStimuli; // If stimuli are equal, correct answer is "Same" (false)
    
    // Whether the response is correct
    const correct = (response === correctAnswer);
    const timestamp = new Date().toISOString();
    const type = "RESPONSE";
    
    console.log("Response:", response ? "Different" : "Same");
    console.log("Correct Answer:", correctAnswer ? "Different" : "Same");
    console.log("Correct:", correct);
    
    // Determine if we need to change direction (up/down) for tracking reversals
    let direction = null;
    let isReversal = false;
    
    // For non-equal stimuli trials, apply three-down-one-up rule
    if (!equalStimuli) {
      if (correct) {
        // Increment consecutive correct counter
        const newConsecutiveCorrect = consecutiveCorrect + 1;
        setConsecutiveCorrect(newConsecutiveCorrect);
        
        // If three consecutive correct, decrease difference
        if (newConsecutiveCorrect >= 3) {
          // Convert to dB, reduce by step size, convert back to linear
          const currentDifferenceDB = linearToDB(currentDifference);
          const newDifferenceDB = currentDifferenceDB - stepSize;
          const newDifference = Math.round(dBToLinear(newDifferenceDB) * 10) / 10;
          
          direction = 'down';
          
          // Check if this is a reversal
          if (lastDirection === 'up') {
            isReversal = true;
            setReversalPoints(prev => prev + 1);
          }
          
          // Update difference and reset consecutive correct counter
          setCurrentDifference(newDifference);
          setConsecutiveCorrect(0);
          
          // Update best difference if appropriate
          if (newDifference < bestDifference) {
            setBestDifference(newDifference);
          }
        }
      } else {
        // If incorrect, increase difference
        // Convert to dB, increase by step size, convert back to linear
        const currentDifferenceDB = linearToDB(currentDifference);
        const newDifferenceDB = currentDifferenceDB + stepSize;
        const newDifference = Math.round(dBToLinear(newDifferenceDB) * 10) / 10;
        
        direction = 'up';
        
        // Check if this is a reversal
        if (lastDirection === 'down') {
          isReversal = true;
          setReversalPoints(prev => prev + 1);
        }
        
        // Update difference and reset consecutive correct counter
        setCurrentDifference(newDifference);
        setConsecutiveCorrect(0);
      }
    } else {
      // For equal stimuli trials, we don't adjust the difference
      // Just record data for false positive analysis
      console.log("Equal stimuli trial - no adjustment to difference");
    }
    
    // Update last direction if we had a direction change
    if (direction) {
      setLastDirection(direction);
    }
    
    // Calculate test amplitude (accounting for equal stimuli trials)
    const testAmplitude = equalStimuli ? referenceAmplitude : referenceAmplitude + currentDifference;
    
    // Record trial data with actuator information
    setTrialData(prev => [...prev, { 
      referenceAmplitude, 
      testAmplitude,
      difference: currentDifference,
      equalStimuli,
      response, // true = "Different", false = "Same"
      correct, 
      timestamp,
      isReversal,
      consecutiveCorrect: correct ? consecutiveCorrect + 1 : consecutiveCorrect,
      reversalNumber: isReversal ? reversalPoints + 1 : reversalPoints,
      type,
      device: deviceType,
      actuator: currentActuatorIndex
    }]);
    
    // Randomly determine higher interval for next trial (0 = first, 1 = second)
    const nextInterval = Math.random() < 0.5 ? 0 : 1;
    setHigherInterval(nextInterval);
    
    // Decide if next trial should have equal stimuli (10% chance)
    const isEqualStimuliTrial = Math.random() < 0.1;
    setEqualStimuli(isEqualStimuliTrial);
    
    // Check if we've reached 6 reversal points (only for non-equal stimuli trials)
    if (!equalStimuli && reversalPoints + (isReversal ? 1 : 0) >= 6) {
      // Cycle to the next actuator
      const nextActuatorIndex = (currentActuatorIndex + 1) % NUM_ACTUATORS;
      setCurrentActuatorIndex(nextActuatorIndex);
      
      // If we've cycled through all actuators, end the experiment
      if (nextActuatorIndex === 0) {
        alert("Experiment ended. All actuators have been tested.");
        setExperimentEnded(true);
      } else {
        // Otherwise, start a new staircase with the next actuator
        alert(`Staircase for actuator ${currentActuatorIndex} completed with 6 reversal points. Starting actuator ${nextActuatorIndex}.`);
        setSelectedActuator(nextActuatorIndex);
        setCurrentDifference(INITIAL_DIFFERENCE);
        setConsecutiveCorrect(0);
        setReversalPoints(0);
        setLastDirection(null);
        
        // Automatically start next trial after a short delay
        setTimeout(() => {
          handlePlay();
        }, 1000);
      }
    } else {
      // Reset the hasBeenPlayed state
      setHasBeenPlayed(false);
      
      // Automatically start next trial after a short delay
      setTimeout(() => {
        handlePlay();
      }, 1000);
    }
  }, [
    experimentStarted, experimentEnded, hasBeenPlayed, higherInterval,
    consecutiveCorrect, lastDirection, currentDifference, stepSize,
    bestDifference, reversalPoints, deviceType, currentActuatorIndex,
    NUM_ACTUATORS, handlePlay, equalStimuli, referenceAmplitude
  ]);

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Prevent default actions for these keys
      if (event.key === ' ' || event.key === 's' || event.key === 'd') {
        event.preventDefault();
      }
      
      // Handle space bar press - Play
      if (event.key === ' ' && experimentStarted && !experimentEnded && !hasBeenPlayed) {
        handlePlay();
      }
      
      // Handle 's' key press - "Same" response
      if (event.key === 's' && experimentStarted && !experimentEnded && hasBeenPlayed) {
        handleResponse(false);
      }
      
      // Handle 'd' key press - "Different" response
      if (event.key === 'd' && experimentStarted && !experimentEnded && hasBeenPlayed) {
        handleResponse(true);
      }
    };
    
    // Add keyboard event listener
    window.addEventListener('keydown', handleKeyPress);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [experimentStarted, experimentEnded, hasBeenPlayed, handlePlay, handleResponse]);

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

  // Calculate maximum and minimum difference
  const maxDifference = trialData.length > 0
    ? Math.max(...trialData.map(t => t.difference)) + 2 * dBToLinear(stepSize)
    : INITIAL_DIFFERENCE + dBToLinear(stepSize);

  const minDifference = trialData.length > 0
    ? Math.min(...trialData.map(t => t.difference)) - 2 * dBToLinear(stepSize)
    : 0;

  // Generate coordinates for the plot
  const points = trialData.map((t, i) => {
    const x = trialData.length > 1
      ? padding + (i / (trialData.length - 1)) * (plotWidth - 2 * padding)
      : plotWidth / 2;
    const y = trialData.length > 1
      ? padding + ((maxDifference - t.difference) / (maxDifference - minDifference)) * (plotHeight - 2 * padding)
      : plotHeight / 2;

    return { x, y, correct: t.correct, equalStimuli: t.equalStimuli };
  });

  // String for polyline - exclude equal stimuli trials from the line
  const polylinePoints = points
    .filter((_, i) => !trialData[i].equalStimuli)
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  const handleSaveCSV = () => {
    // Convert trialData to CSV
    // CSV Headers
    const headers = [
      "Timestamp", 
      "ReferenceAmplitude",
      "TestAmplitude",
      "Difference", 
      "EqualStimuli",
      "Response", // true = "Different", false = "Same"
      "Correct", 
      "ConsecutiveCorrect",
      "IsReversal",
      "ReversalNumber",
      "Type",
      "Actuator"
    ];
    
    const rows = trialData.map(t => [
      t.timestamp, 
      t.referenceAmplitude,
      t.testAmplitude,
      t.difference,
      t.equalStimuli,
      t.response ? "Different" : "Same",
      t.correct,
      t.consecutiveCorrect,
      t.isReversal || false,
      t.reversalNumber || "",
      t.type,
      t.actuator
    ]);

    let csvContent = headers.join(",") + "\n";
    rows.forEach(r => {
      csvContent += r.join(",") + "\n";
    });

    // Save experiment configuration
    const headers2 = ["Reference Amplitude", "Initial Difference", "Step Size (dB)", "Best Difference", "Total Reversals", "Errors Accepted"];
    const rows2 = [[referenceAmplitude, INITIAL_DIFFERENCE, stepSize, bestDifference, reversalPoints, errorsAccepted]];

    csvContent += "\n\n" + headers2.join(",") + "\n";
    rows2.forEach(r => {
      csvContent += r.join(",") + "\n";
    });

    // Create a blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "relative_threshold_data_" + String(PID) + ".csv";
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
          {experimentStarted && !experimentEnded && (
            <button 
              className="playButton" 
              onClick={handlePlay}
              disabled={firstIntervalActive || secondIntervalActive || intervalGap}>
              {hasBeenPlayed ? "Replay" : "Play"} <span className="keyboardShortcut">(Space)</span>
            </button>
          )}

          {experimentStarted && !experimentEnded && (
            <div className="responseButtonsContainer">
              {hasBeenPlayed && (
                <div className="responseButtons">
                  <p>Were the vibrations the same or different?</p>
                  <button className="responseButton" onClick={() => handleResponse(false)}>
                    Same <span className="keyboardShortcut">(S)</span>
                  </button>
                  <button className="responseButton" onClick={() => handleResponse(true)}>
                    Different <span className="keyboardShortcut">(D)</span>
                  </button>
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
            <h3>Difference Threshold Plot</h3>
            <div className="plot">
              <svg width={plotWidth} height={plotHeight} style={{ border: '10px solid #ccc' }}>
                {/* Draw polyline if we have at least two points (excluding equal stimuli trials) */}
                {points.filter((_, i) => !trialData[i].equalStimuli).length > 1 && (
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
                    // Use different colors for equal stimuli trials
                    fill={trialData[i].equalStimuli ? 'purple' : (p.correct ? 'green' : 'red')}
                    stroke="#000"
                    strokeWidth="1"
                  >
                    <title>{`Trial ${i + 1}: ${trialData[i].equalStimuli ? 'Equal Stimuli' : `Diff=${trialData[i].difference}`}, ${p.correct ? 'Correct' : 'Incorrect'}`}</title>
                  </circle>
                ))}
                {/* Add a horizontal line for best difference */}
                {trialData.length > 0 && (
                  <line
                    x1={padding}
                    y1={
                      padding + ((maxDifference - bestDifference) / (maxDifference - minDifference)) * (plotHeight - 2 * padding)
                    }
                    x2={plotWidth - padding}
                    y2={
                      padding + ((maxDifference - bestDifference) / (maxDifference - minDifference)) * (plotHeight - 2 * padding)
                    }
                    stroke="orange"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                  />
                )}
                {/* Add text for best difference */}
                {trialData.length > 0 && (
                  <text
                    x={padding}
                    y={
                      padding + ((maxDifference - bestDifference) / (maxDifference - minDifference)) * (plotHeight - 2 * padding) - 10
                    }
                    fill="orange"
                    fontSize="12"
                  >
                    Best Difference: {bestDifference}
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
              <label>Reference Amplitude:</label>
              <input
                type="number"
                step="0.01"
                value={referenceAmplitude}
                onChange={e => setReferenceAmplitude(parseFloat(e.target.value))}
              />
            </div>
            <div className="inputGroup">
              <label>Initial Difference:</label>
              <input
                type="number"
                step="0.01"
                value={currentDifference}
                onChange={e => setCurrentDifference(parseFloat(e.target.value))}
              />
            </div>
            <div className="inputGroup">
              <label>Step Size (dB):</label>
              <input
                type="number"
                step="0.01"
                value={stepSize}
                onChange={e => setStepSize(parseFloat(e.target.value))}
              />
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
            <div className="inputGroup">
              <label>Errors Accepted: {errorsAccepted}</label>
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