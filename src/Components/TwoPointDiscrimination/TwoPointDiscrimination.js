import React, { useEffect, useState, useRef } from 'react';
import { loadButtonPositions } from '../Localization/buttonPositions';
import '../Localization/Localization.css';

const NUM_ACTUATORS = 6; // 6 motors
const TRIALS_PER_MOTOR = 5; // Each motor repeated 10 times
const STIMULUS_DURATION = 500; // 500 ms
const INTER_STIMULUS_INTERVAL = 1000; // 1000 ms between first and second stimulus
const RESPONSE_DELAY = 1000; // 1000 ms delay after participant's guess
const FEEDBACK_DURATION = 750; // How long to show the feedback
const START_DELAY = 1000; // 1000 ms delay after start experiment is pressed
const DEFAULT_PID = 0; // Default PID value
const WS_URL = 'ws://127.0.0.1:8000';

// Discrimination options
const DISCRIMINATION_OPTIONS = {
  SAME: 'same',
  NEXT: 'next',
  PREVIOUS: 'previous'
};

const TwoPointDiscrimination = () => {
  const [deviceType, setDeviceType] = useState('');
  const [pid, setPid] = useState(process.env.REACT_APP_PID ? parseInt(process.env.REACT_APP_PID) : DEFAULT_PID);
  const [buttonPositions, setButtonPositions] = useState([]);
  const [trialSequence, setTrialSequence] = useState([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [firstStimulus, setFirstStimulus] = useState(null);
  const [secondStimulus, setSecondStimulus] = useState(null);
  const [activeMotor, setActiveMotor] = useState(null);
  const [responses, setResponses] = useState([]);
  const [experimentStarted, setExperimentStarted] = useState(false);
  const [experimentEnded, setExperimentEnded] = useState(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isAcclimationMode, setIsAcclimationMode] = useState(true);
  const [currentAcclimationButton, setCurrentAcclimationButton] = useState(1);
  const [feedbackOption, setFeedbackOption] = useState(null);
  const [stimulusPhase, setStimulusPhase] = useState(0); // 0: none, 1: first stimulus, 2: second stimulus
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

  // Set device type and PID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('DEVICE_TYPE');
    const pidParam = params.get('PID');
    const validDevices = ['overear', 'bracelet', 'necklace'];

    if (deviceParam && validDevices.includes(deviceParam.toLowerCase())) {
      setDeviceType(deviceParam.toLowerCase());
      console.log('Device type set to:', deviceParam.toLowerCase());
    }
    
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

  // Validation effect to check the trial sequence
  useEffect(() => {
    if (trialSequence.length > 0) {
      let invalidTrials = 0;
      let optionCounts = {
        [DISCRIMINATION_OPTIONS.SAME]: 0,
        [DISCRIMINATION_OPTIONS.NEXT]: 0,
        [DISCRIMINATION_OPTIONS.PREVIOUS]: 0
      };
      
      trialSequence.forEach((trial, index) => {
        // Count option distribution
        optionCounts[trial.option]++;
        
        const secondMotor = getSecondMotorIndex(trial.firstMotor, trial.option);
        const isAdjacent = 
          secondMotor === trial.firstMotor || 
          secondMotor === (trial.firstMotor + 1) % NUM_ACTUATORS || 
          secondMotor === (trial.firstMotor - 1 + NUM_ACTUATORS) % NUM_ACTUATORS;
          
        if (!isAdjacent) {
          invalidTrials++;
          console.error(`Trial ${index} has non-adjacent motors: ${trial.firstMotor} -> ${secondMotor}`);
        }
      });
      
      console.log("Option distribution:", optionCounts);
      
      if (invalidTrials > 0) {
        console.error(`Found ${invalidTrials} trials with non-adjacent motors!`);
      } else {
        console.log("All trials use adjacent or same motors");
      }
    }
  }, [trialSequence]);

  // Start the first trial after experimentStarted is set to true
  useEffect(() => {
    if (experimentStarted && trialSequence.length > 0) {
      setTimeout(() => {
        startTrial(0); // Start from the first trial
      }, START_DELAY);
    }
  }, [experimentStarted, trialSequence]);

  const generateTrialSequence = () => {
    const sequence = [];
    
    for (let i = 0; i < NUM_ACTUATORS; i++) {
      // 50% of trials: SAME
      for (let j = 0; j < TRIALS_PER_MOTOR / 2; j++) {
        sequence.push({
          firstMotor: i,
          option: DISCRIMINATION_OPTIONS.SAME
        });
      }
      
      if (i === 0) {
        // For motor 0, only SAME & NEXT
        for (let j = 0; j < TRIALS_PER_MOTOR / 2; j++) {
          sequence.push({
            firstMotor: i,
            option: DISCRIMINATION_OPTIONS.NEXT
          });
        }
      } else if (i === NUM_ACTUATORS - 1) {
        // For the last motor, only SAME & PREVIOUS
        for (let j = 0; j < TRIALS_PER_MOTOR / 2; j++) {
          sequence.push({
            firstMotor: i,
            option: DISCRIMINATION_OPTIONS.PREVIOUS
          });
        }
      } else {
        // Middle motors: half NEXT, half PREVIOUS
        for (let j = 0; j < TRIALS_PER_MOTOR / 4; j++) {
          sequence.push({
            firstMotor: i,
            option: DISCRIMINATION_OPTIONS.NEXT
          });
        }
        for (let j = 0; j < TRIALS_PER_MOTOR / 4; j++) {
          sequence.push({
            firstMotor: i,
            option: DISCRIMINATION_OPTIONS.PREVIOUS
          });
        }
      }
    }
  
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

  const getSecondMotorIndex = (firstMotorIndex, option) => {
    if (option === DISCRIMINATION_OPTIONS.SAME) {
      return firstMotorIndex;
    } else if (option === DISCRIMINATION_OPTIONS.NEXT) {
      if (firstMotorIndex === NUM_ACTUATORS - 1) {
        return firstMotorIndex;
      }
      return firstMotorIndex + 1;
    } else if (option === DISCRIMINATION_OPTIONS.PREVIOUS) {
      if (firstMotorIndex === 0) {
        return firstMotorIndex;
      }
      return firstMotorIndex - 1;
    }
    return firstMotorIndex; 
  };

  const activateMotor = (motorIndex) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    const rotatedIndex = (motorIndex + 2) % NUM_ACTUATORS;    
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
    
    setActiveMotor(motorIndex);
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
    
    setActiveMotor(null);
  };

  const startTrial = (trialIndex) => {
    if (trialIndex >= trialSequence.length) {
      endExperiment();
      return;
    }
    
    if (trialSequence.length === 0) {
      console.error('Trial sequence is empty!');
      return;
    }

    const trial = trialSequence[trialIndex];
    if (!trial) {
      console.error('Trial is undefined, skipping');
      setCurrentTrialIndex(trialIndex + 1);
      return;
    }
    
    const secondMotorIndex = getSecondMotorIndex(trial.firstMotor, trial.option);
    
    console.log(
      `Starting trial ${trialIndex + 1}, first motor: ${trial.firstMotor + 1}, ` +
      `option: ${trial.option}, second motor: ${secondMotorIndex + 1}`
    );
    
    setFirstStimulus(trial.firstMotor);
    setSecondStimulus(secondMotorIndex);
    setCurrentTrialIndex(trialIndex);
    setFeedbackOption(null);
    setStimulusPhase(0);

    setTimeout(() => {
      presentFirstStimulus(trial.firstMotor, secondMotorIndex);
    }, 500);
  };

  const presentFirstStimulus = (motorIndex, secondIndex) => {
    console.log(`Presenting first (reference) stimulus: Motor ${motorIndex + 1}, (Second will be: ${secondIndex + 1})`);
    setStimulusPhase(1);    
    activateMotor(motorIndex);
    
    setTimeout(() => {
      deactivateMotor();
      setTimeout(() => {
        presentSecondStimulus(secondIndex);
      }, INTER_STIMULUS_INTERVAL);
    }, STIMULUS_DURATION);
  };
  
  const presentSecondStimulus = (motorIndex) => {
    console.log(`Presenting second stimulus: Motor ${motorIndex + 1}`);
    setStimulusPhase(2);
    
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    const rotatedIndex = (motorIndex + 2) % NUM_ACTUATORS;    
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
    
    setTimeout(() => {
      deactivateMotor();
      setStimulusPhase(0);
      setWaitingForResponse(true);
    }, STIMULUS_DURATION);
  };

  const handleAcclimationClick = (motorPosition) => {
    if (!wsConnected) return;
    
    if (motorPosition + 1 !== currentAcclimationButton) {
      return;
    }
    
    activateMotor(motorPosition);
    
    setTimeout(() => {
      deactivateMotor();
    }, STIMULUS_DURATION);

    if (currentAcclimationButton < NUM_ACTUATORS) {
      setCurrentAcclimationButton(prev => prev + 1);
    } else {
      // Acclimation complete
      setCurrentAcclimationButton(0);
    }
  };

  const handleStartExperiment = () => {
    if (!wsConnected) {
      alert('WebSocket is not connected. Please try again.');
      return;
    }
    
    setIsAcclimationMode(false);
    setWaitingForResponse(false);
    
    const sequence = generateTrialSequence();
    console.log('Generated trial sequence:', sequence);
    setTrialSequence(sequence);
    setExperimentStarted(true);
  };

  const handleResponse = (responseOption) => {
    if (!waitingForResponse) return;

    const trial = trialSequence[currentTrialIndex];
    const actualOption = trial.option;
    
    setResponses(prev => [
      ...prev,
      {
        firstMotor: firstStimulus,
        secondMotor: secondStimulus,
        actualOption: actualOption,
        responseOption: responseOption,
        correct: actualOption === responseOption,
        timestamp: new Date(),
        trialIndex: currentTrialIndex
      }
    ]);

    setWaitingForResponse(false);
    
    setTimeout(() => {
      const nextTrialIndex = currentTrialIndex + 1;
      startTrial(nextTrialIndex);
    }, RESPONSE_DELAY);
  };

  const endExperiment = () => {
    setExperimentEnded(true);
    setExperimentStarted(false);
    console.log('Experiment ended. Total responses:', responses.length);
  };

  const handleSaveCSV = () => {
    console.log('Saving responses:', responses);
  
    const headers = [
      'Trial',
      'FirstMotor',
      'SecondMotor',
      'ActualOption',
      'ResponseOption',
      'Correct',
      'Timestamp',
      'PID',
      'DeviceType'
    ];
    const rows = responses.map((r, index) => [
      index + 1,
      r.firstMotor,
      r.secondMotor,
      r.actualOption,
      r.responseOption,
      r.correct ? 1 : 0,
      r.timestamp,
      pid,
      deviceType
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
    a.download = `two_point_discrimination_${deviceType}_pid${pid}_${timestamp}.csv`;
    console.log(`Saving data for ${deviceType} with PID ${pid}`);
    
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="container">
      <h2 style={{ color: 'darkgrey' }}>Two-Point Discrimination</h2>
      <p style={{ color: 'darkgrey', textAlign: 'center', marginBottom: '15px' }}>
        First a reference stimulus will be shown in yellow. Then a second stimulus will be activated (but not shown).
        Click on the position where you think the second stimulus was activated.
      </p>
      
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
            Trial {currentTrialIndex + 1} / {trialSequence.length}
          </p>
          {waitingForResponse && (
            <div className="response-options">
              <p className="response-instruction">Click on the position where you think the second stimulus was activated:</p>
            </div>
          )}
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
            const isFirstActive = firstStimulus === i;
            const buttonStyle = {
              position: 'absolute',
              left: `${btn.x}%`,
              top: `${btn.y}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'transparent',
              width: '40px',
              height: '40px',
              zIndex: 10,
              transition: 'all 0.2s ease'
            };
            
            if (isAcclimationMode) {
              buttonStyle.backgroundColor = currentAcclimationButton === i + 1
                ? 'rgba(255, 99, 71, 0.5)'
                : 'rgba(0, 0, 0, 0.2)';
              buttonStyle.color = currentAcclimationButton === i + 1 ? 'white' : 'grey';
              buttonStyle.opacity = 1;
              buttonStyle.border = currentAcclimationButton === i + 1
                ? '2px solid red'
                : '1px solid grey';
            } else if (activeMotor === i && stimulusPhase === 1) {
              // Highlight the first stimulus in yellow
              buttonStyle.backgroundColor = '#FFC107';
              buttonStyle.border = '2px solid #FFA000';
              buttonStyle.color = 'black';
              buttonStyle.opacity = 1;
              buttonStyle.width = '50px';
              buttonStyle.height = '50px';
              buttonStyle.zIndex = 100;
            } else if (waitingForResponse) {
              buttonStyle.backgroundColor = 'rgba(0, 0, 0, 0.2)';
              buttonStyle.border = '1px solid #ccc';
              buttonStyle.color = 'black';
              buttonStyle.opacity = 0.6;
            }
            
            return (
              <button
                key={btn.id}
                className="circle-button"
                onClick={() => {
                  if (isAcclimationMode) {
                    handleAcclimationClick(i);
                  } else if (waitingForResponse) {
                    let validOptions = [firstStimulus];
                    if (firstStimulus < NUM_ACTUATORS - 1) {
                      validOptions.push(firstStimulus + 1);
                    }
                    if (firstStimulus > 0) {
                      validOptions.push(firstStimulus - 1);
                    }
                    
                    if (validOptions.includes(i)) {
                      let responseOption;
                      if (i === firstStimulus) {
                        responseOption = DISCRIMINATION_OPTIONS.SAME;
                      } else if (i === firstStimulus + 1) {
                        responseOption = DISCRIMINATION_OPTIONS.NEXT;
                      } else if (i === firstStimulus - 1) {
                        responseOption = DISCRIMINATION_OPTIONS.PREVIOUS;
                      }
                      handleResponse(responseOption);
                    } else {
                      console.log("Invalid option selected");
                    }
                  }
                }}
                style={buttonStyle}
                disabled={
                  feedbackOption !== null ||
                  (experimentStarted && !waitingForResponse && !isAcclimationMode)
                }
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
        .diagram-container {
          position: relative;
          margin-top: 40px; /* Added extra space to push the diagram down */
        }
        
        .circle-button:active {
          background-color: rgba(0, 0, 0, 0.5) !important;
          opacity: 0.7 !important;
          transition: all 0.1s ease-out;
        }
        
        .circle-button:hover {
          opacity: 0.9 !important;
          transform: translate(-50%, -50%) scale(1.1);
        }
        
        .stimulus-indicator {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          margin: 10px auto;
          background-color: #3498db;
        }
        
        .response-options {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 15px;
        }
        
        .response-button {
          padding: 10px 15px;
          background-color: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .response-button:hover {
          background-color: #e0e0e0;
        }
        
        .response-instruction {
          margin-bottom: 10px;
          font-weight: 500;
          color: #555;
          text-align: center;
          z-index: 9999; /* Just to ensure it's on top if anything overlaps */
        }
        
        .feedback {
          margin-top: 15px;
          padding: 10px;
          background-color: #f8f9fa;
          border-radius: 4px;
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default TwoPointDiscrimination;