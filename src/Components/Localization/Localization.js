import React, { useEffect, useState, useRef } from 'react';
import { loadButtonPositions } from './buttonPositions'; // Ensure path is correct
import './Localization.css';

const NUM_ACTUATORS = 6; // 6 motors
const TRIALS_PER_MOTOR = 10; // Each motor repeated 10 times
const STIMULUS_DURATION = 500; // 500 ms
const PID = parseInt(process.env.REACT_APP_PID); // Ensure PID is set in environment variables

const Experiment = () => {
  const [deviceType, setDeviceType] = useState('');
  const [buttonPositions, setButtonPositions] = useState([]);
  const [trialSequence, setTrialSequence] = useState([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [activeMotor, setActiveMotor] = useState(null);
  const [responses, setResponses] = useState([]); // { motor: number, response: number, timestamp: Date }
  const [experimentStarted, setExperimentStarted] = useState(false);
  const [experimentEnded, setExperimentEnded] = useState(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const wsRef = useRef(null);

  // Set device type from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('DEVICE_TYPE');
    const validDevices = ['overear', 'bracelet', 'necklace'];

    if (deviceParam && validDevices.includes(deviceParam.toLowerCase())) {
      setDeviceType(deviceParam.toLowerCase());
    }
  }, []);

  // Load button positions
  useEffect(() => {
    if (!deviceType) return;

    const savedPositions = loadButtonPositions(deviceType);
    if (savedPositions) {
      setButtonPositions(savedPositions);
    } else {
      console.warn(`No saved positions found for ${deviceType}`);
    }
  }, [deviceType]);

  // Generate randomized trial sequence
  const generateTrialSequence = () => {
    const sequence = [];
    for (let motor = 0; motor < NUM_ACTUATORS; motor++) {
      for (let i = 0; i < TRIALS_PER_MOTOR; i++) {
        sequence.push(motor);
      }
    }
    return sequence.sort(() => Math.random() - 0.5); // Shuffle
  };

  const handleStartExperiment = () => {
    setTrialSequence(generateTrialSequence());
    setExperimentStarted(true);
    setExperimentEnded(false);
    setResponses([]);
    setCurrentTrialIndex(0);
    startTrial(0);
  };

  const startTrial = (trialIndex) => {
    if (trialIndex >= NUM_ACTUATORS * TRIALS_PER_MOTOR) {
      endExperiment();
      return;
    }

    const motor = trialSequence[trialIndex];
    setActiveMotor(motor);
    setWaitingForResponse(true);

    // Send motor activation signal
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const amplitudes = Array.from({ length: NUM_ACTUATORS }, (_, i) =>
        i === motor ? 1 : 0
      );
      const message = JSON.stringify({
        device: deviceType,
        amplitudes,
        timestamp: Date.now(),
        duration: STIMULUS_DURATION,
      });
      wsRef.current.send(message);
    }

    // Deactivate the motor after the stimulus duration
    setTimeout(() => {
      setActiveMotor(null); // Turn off the motor
    }, STIMULUS_DURATION);
  };

  const handleResponse = (response) => {
    if (!waitingForResponse) return; // Ignore responses if not waiting

    const motor = trialSequence[currentTrialIndex];
    setResponses((prev) => [
      ...prev,
      { motor, response, timestamp: new Date() },
    ]);

    setWaitingForResponse(false); // Stop waiting for a response
    setCurrentTrialIndex((prev) => prev + 1); // Move to the next trial
    startTrial(currentTrialIndex + 1); // Start the next trial
  };

  const endExperiment = () => {
    setExperimentEnded(true);
    setExperimentStarted(false);
  };

  const handleSaveCSV = () => {
    const headers = ['Motor', 'Response', 'Timestamp', 'PID', 'Device Type'];
    const rows = responses.map((r) => [
      r.motor,
      r.response,
      r.timestamp,
      PID,
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
    a.download = `localization_accuracy_${deviceType}_${PID}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <h2 style={{ color: 'darkgrey' }}>Localization</h2>

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
          {buttonPositions.map((btn, i) => (
            <button
              key={btn.id}
              className="circle-button"
              onClick={() => handleResponse(i)}
              style={{
                position: 'absolute',
                left: `${btn.x}%`,
                top: `${btn.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {!experimentStarted && !experimentEnded && (
        <button onClick={handleStartExperiment}>Start Experiment</button>
      )}

      {experimentEnded && (
        <div>
          <p>Experiment Completed!</p>
          <button onClick={handleSaveCSV}>Save Results</button>
        </div>
      )}
    </div>
  );
};

export default Experiment;
