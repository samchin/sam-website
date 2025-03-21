import React, { useEffect, useState, useRef } from 'react';
import { loadButtonPositions } from './buttonPositions';
import './Localization.css';

const NUM_ACTUATORS = 6; // 6 motors
const TRIALS_PER_MOTOR = 10; // Each motor repeated 10 times
const STIMULUS_DURATION = 500; // 500 ms
const RESPONSE_DELAY = 1000; // 1000 ms delay after participant's guess
const FEEDBACK_DURATION = 750; // How long to show the feedback (1500 ms)

const START_DELAY = 1000; // 1000 ms delay after start experiment is pressed
const DEFAULT_PID = 0; // Default PID value
const WS_URL = 'ws://127.0.0.1:8000';

const Experiment = () => {
  const [deviceType, setDeviceType] = useState('');
  const [pid, setPid] = useState(process.env.REACT_APP_PID ? parseInt(process.env.REACT_APP_PID) : DEFAULT_PID);
  const [buttonPositions, setButtonPositions] = useState([]);
  const [trialSequence, setTrialSequence] = useState([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [activeMotor, setActiveMotor] = useState(null);
  const [responses, setResponses] = useState([]);
  const [experimentStarted, setExperimentStarted] = useState(false);
  const [experimentEnded, setExperimentEnded] = useState(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isAcclimationMode, setIsAcclimationMode] = useState(true);
  const [currentAcclimationButton, setCurrentAcclimationButton] = useState(1);
  const [isReversedAcclimation, setIsReversedAcclimation] = useState(false);
  const [feedbackMotorIndex, setFeedbackMotorIndex] = useState(null);

  const wsRef = useRef(null);

  // Set up WebSocket connection
  useEffect(() => {
    console.log('Initializing WebSocket connection...');
    const ws = new WebSocket(WS_URL);
    console.log('Attempting to connect to WebSocket at:', WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
    };

    ws.onmessage = (message) => {
      console.log('Received from server:', message.data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setWsConnected(false);
    };

    return () => {
      console.log('Cleaning up WebSocket connection');
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    // Get device type and PID from URL
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('DEVICE_TYPE');
    const pidParam = params.get('PID');
    const validDeviceTypes = ['overear', 'bracelet', 'necklace']; // Define valid types
  
    if (!deviceParam || !validDeviceTypes.includes(deviceParam.toLowerCase())) {
      console.error('Invalid or missing device type');
      return;
    }
  
    setDeviceType(deviceParam.toLowerCase());
    
    // Set PID from URL parameter if it exists
    if (pidParam) {
      setPid(parseInt(pidParam));
      console.log(`PID set from URL: ${pidParam}`);
    }
  }, []);

  // Load button positions
  useEffect(() => {
    if (!deviceType) return;

    const savedPositions = loadButtonPositions(deviceType);
    if (savedPositions) {
      setButtonPositions(savedPositions);
      console.log('Loaded button positions for device:', deviceType);
    } else {
      console.warn(`No saved positions found for ${deviceType}`);
    }
  }, [deviceType]);

  const generateTrialSequence = () => {
    const sequence = [];
  
    // Outer loop iterates over the number of actuators
    for (let i = 0; i < NUM_ACTUATORS; i++) {
      // Inner loop iterates over trials per motor
      for (let j = 0; j < TRIALS_PER_MOTOR; j++) {
        sequence.push(i);
        // Each actuator is added to the list TRIALS_PER_MOTOR number of times
      }
    }
  
    // Shuffle the sequence
    shuffleArray(sequence);
  
    return sequence;
  };
  
  // Shuffle array function
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };

  const activateMotor = (motorIndex) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    // Apply 120-degree rotation (2 positions clockwise)
    const rotatedIndex = (motorIndex + 2) % NUM_ACTUATORS;
    //console.log('motor index', motorIndex);
    
    // Ensure amplitude is exactly 1 for the active motor
    const amplitudes = new Array(NUM_ACTUATORS).fill(0);
    amplitudes[rotatedIndex] = 1;

    const message = JSON.stringify({
      device: deviceType,
      amplitudes,
      timestamp: Date.now(),
      duration: STIMULUS_DURATION
    });

    console.log('----------------------------------------');
    console.log(`MOTOR ${motorIndex + 1} ACTIVATED (rotated to position ${rotatedIndex + 1})`);
    console.log('Amplitudes:', amplitudes);
    console.log('----------------------------------------');
    wsRef.current.send(message);
  };

  const deactivateMotor = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    const message = JSON.stringify({
      device: deviceType,
      amplitudes: new Array(NUM_ACTUATORS).fill(0),
      timestamp: Date.now(),
      duration: 0
    });

    console.log('Sending motor deactivation:', message);
    wsRef.current.send(message);
  };

  const startTrial = (trialIndex) => {
    if (trialIndex >= NUM_ACTUATORS * TRIALS_PER_MOTOR) {
      endExperiment();
      return;
    }
    
    if (trialSequence.length === 0) {
      console.error('!!!trial sequence is empty!!!!!!');
      return;
    }

    // Get the current motor index from the sequence
    let motor = trialSequence[trialIndex];
    if (motor === undefined || isNaN(motor)) {
      console.error('Motor index is undefined or NaN, skipping to the next trial');
      motor = trialSequence[trialIndex + 1];
      setCurrentTrialIndex(trialIndex + 1);
    }
    console.log(`Starting trial ${trialIndex + 1}, activating motor ${motor}`);
    
    // Set states
    setActiveMotor(motor);
    setWaitingForResponse(true);
    setCurrentTrialIndex(trialIndex);
    setFeedbackMotorIndex(null);


    // Ensure WebSocket is ready before sending
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Activate the selected motor
      activateMotor(motor);

      // Deactivate after stimulus duration
      setTimeout(() => {
        setActiveMotor(null);
        deactivateMotor();
      }, STIMULUS_DURATION);
    } else {
      console.error('WebSocket not ready for trial:', trialIndex);
    }
  };

  const handleAcclimationClick = (motorPosition) => {
    if (!wsConnected) return;
    
    // Only allow clicking the current prompted button
    if (motorPosition + 1 !== currentAcclimationButton) {
      // Instead of alert, we'll update the instruction text
      return;
    }
    
    // Activate the motor for the standard duration
    activateMotor(motorPosition);
    
    // Deactivate after stimulus duration
    setTimeout(() => {
      deactivateMotor();
    }, STIMULUS_DURATION);

    // Move to next button
    if (currentAcclimationButton < NUM_ACTUATORS) {
      setCurrentAcclimationButton(prev => prev + 1);
    } else {
      // Mark acclimation as complete but don't start experiment
      setCurrentAcclimationButton(0); // 0 indicates all buttons have been pressed
    }
  };

  const handleStartExperiment = () => {
    if (!wsConnected) {
      alert('WebSocket is not connected. Please try again.');
      return;
    }
    setWaitingForResponse(false);
    
    setIsAcclimationMode(false);
    
    // Generate sequence first
    const sequence = generateTrialSequence();
    console.log('Generated trial sequence:', sequence);
    setTrialSequence(sequence);
    setExperimentStarted(true);
  };

  // Use useEffect to start the first trial after experimentStarted is set to true
  useEffect(() => {
    if (experimentStarted && trialSequence.length > 0) {
      setTimeout(() => {
        startTrial(0); // Start from the first trial
      }, START_DELAY); // 1-second delay before starting the first trial
    }
  }, [experimentStarted, trialSequence]);

  const handleResponse = (response) => {
    if (!waitingForResponse) return;

    const currentMotor = trialSequence[currentTrialIndex];

    // Record response
    setResponses(prev => [...prev, {
      motor: currentMotor,
      response: response,
      timestamp: new Date(),
      trialIndex: currentTrialIndex
    }]);


    // Disable further responses while showing feedback
    setWaitingForResponse(false);
    
    // Show feedback about which motor was actually activated
    console.log('SHOWING FEEDBACK FOR MOTOR:', currentMotor + 1);
    setFeedbackMotorIndex(currentMotor);
    
    // After feedback duration, move to next trial
    setTimeout(() => {
      console.log('Feedback period ended, moving to next trial');
      setFeedbackMotorIndex(null);
      
      // Start next trial after delay
      setTimeout(() => {
        const nextTrialIndex = currentTrialIndex + 1;
        startTrial(nextTrialIndex);
      }, RESPONSE_DELAY);
      
    }, FEEDBACK_DURATION);

  };

  const endExperiment = () => {
    setExperimentEnded(true);
    setExperimentStarted(false);
    console.log('Experiment ended. Total responses:', responses.length);
  };

  const handleSaveCSV = () => {
    // Debug log to check alignment
    console.log('Saving responses:', responses);
    console.log('Trial sequence:', trialSequence);
  
    const headers = ['Trial', 'Motor', 'Response', 'Timestamp', 'PID', 'Device Type'];
    const rows = responses.map((r, index) => [
      index + 1,
      r.motor,
      r.response,
      r.timestamp,
      pid,
      deviceType,
    ]);
  
    let csvContent = headers.join(',') + '\n';
    rows.forEach((row) => {
      csvContent += row.join(',') + '\n';
    });
  
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Include device type, PID, and timestamp in the filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `localization_accuracy_${deviceType}_pid${pid}_${timestamp}.csv`;
    console.log(`Saving data for ${deviceType} with PID ${pid}`);
    
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="container">
      <h2 style={{ color: 'darkgrey' }}>Localization</h2>
      
      {!wsConnected && (
        <div className="warning">
          WebSocket not connected. Please check your connection.
        </div>
      )}

      <div className="pid-display" style={{ textAlign: 'center', marginBottom: '10px' }}>
        Participant ID: {pid}
      </div>

      {experimentStarted && !experimentEnded && (
        <div className="stimulus-container">
          <p>
            Trial {currentTrialIndex + 1} / {NUM_ACTUATORS * TRIALS_PER_MOTOR}
          </p>
          <div
            className="stimulus-indicator"
            style={{
              visibility: activeMotor !== null ? 'visible' : 'hidden',
            }}
          />
        </div>
      )}

      <div className="diagram-container">
        <img
          src={`/images/${deviceType}-diagram.jpg`}
          alt={`${deviceType} diagram`}
          className="diagram"
        />
        <div className="button-overlay">

          {buttonPositions.map((btn, i) => {
            // Custom button styling to highlight feedback motor
            const buttonStyle = {
              position: 'absolute',
              left: `${btn.x}%`,
              top: `${btn.y}%`,
              transform: 'translate(-50%, -50%)',
              // Overrides when this is the feedback motor
              backgroundColor: feedbackMotorIndex === i ? '#FFEB3B' : 'transparent',
              border: feedbackMotorIndex === i ? '2px solid #FFC107' : 'none',
              color: feedbackMotorIndex === i ? 'black' : 'transparent',
              opacity: feedbackMotorIndex === i ? 1 : 0,
              fontWeight: feedbackMotorIndex === i ? 'bold' : 'normal',
              width: feedbackMotorIndex === i ? '50px' : '40px',
              height: feedbackMotorIndex === i ? '50px' : '40px',
              zIndex: feedbackMotorIndex === i ? 100 : 10,
              transition: 'all 0.2s ease',
            };
            
            return (
              <button
                key={btn.id}
                className="circle-button"
                onClick={() => isAcclimationMode ? handleAcclimationClick(i) : handleResponse(i)}
                style={buttonStyle}
                disabled={feedbackMotorIndex !== null} // Disable buttons during feedback
              >
                {i + 1}
              </button>
            );
          })}

        </div>
      </div>

      {isAcclimationMode && !experimentStarted && !experimentEnded && (
        <div>
          {currentAcclimationButton > 0 ? (
            <p style={{ color: 'darkgrey', marginTop: '20px', textAlign: 'center' }}>
              Acclimation Mode: Please click button {currentAcclimationButton}
            </p>
          ) : (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <p style={{ color: 'darkgrey' }}>
                Acclimation complete! You can start the experiment when ready.
              </p>
              <button 
                onClick={() => {
                  setIsAcclimationMode(false);
                  handleStartExperiment();
                }}
                disabled={!wsConnected}
                style={{ marginTop: '10px' }}
              >
                Start Experiment
              </button>
            </div>
          )}

        </div>
      )}

      {experimentEnded && (
        <div>
          <p>Experiment Completed!</p>
          <button onClick={handleSaveCSV}>Save Results</button>
        </div>
      )}


      <style jsx>{`
        .circle-button:active {
          background-color: rgba(0, 0, 0, 0.2); /* Flash effect when clicked */
          opacity: 0.3; /* Slightly visible flash */
          transition: opacity 0.1s ease-out; /* Smooth flash effect */
        }
      `}</style>
    </div>
  );
};

export default Experiment;