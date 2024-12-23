import React, { useEffect, useRef, useState } from 'react';
import './Experiment.css';

const NUM_ACTUATORS = parseInt(process.env.REACT_APP_NUMBER_ACTUATOR);
const INITIAL_AMPLITUDE = parseInt(process.env.REACT_APP_INITIAL_AMPLITUDE);
const INITIAL_STEP_SIZE = parseFloat(process.env.REACT_APP_STEP_RESOLUTION);
const INITIAL_ERRORS_ACCEPTED = parseInt(process.env.REACT_APP_REVERSAL);
const PID = parseInt(process.env.REACT_APP_PID);

const Experiment = () => {
  const [examinatorMode, setExaminatorMode] = useState(true);
  const [startAmplitude, setStartAmplitude] = useState(INITIAL_AMPLITUDE);
  const [stepSize, setStepSize] = useState(INITIAL_STEP_SIZE);
  const [errorsAccepted, setErrorsAccepted] = useState(INITIAL_ERRORS_ACCEPTED);
  const [hasRealSignal, setHasRealSignal] = useState(false);

  const [bestAmplitude, setBestAmplitude] = useState(startAmplitude);
  const [currentAmplitude, setCurrentAmplitude] = useState(startAmplitude);
  const [trialData, setTrialData] = useState([]); // {amplitude, correct, timestamp} objects
  const [errorCount, setErrorCount] = useState(0);
  const [experimentStarted, setExperimentStarted] = useState(false);
  const [experimentEnded, setExperimentEnded] = useState(false);

  const [hasBeeenPlayed, setHasBeenPlayed] = useState(false);

  const wsRef = useRef(null);

  // Handle start of experiment
  const handleStart = () => {
    const s = Math.random() < 0.5;
    setHasRealSignal(s);

    setBestAmplitude(startAmplitude);
    setExperimentStarted(true);
    setExperimentEnded(false);
    setExaminatorMode(false);
    setCurrentAmplitude(startAmplitude);
    setTrialData([]);
    setErrorCount(0);
    setHasBeenPlayed(false);
  };

  // Simulate playing the sound (for now, just a console.log)
  const handlePlay = () => {
    const timestamp = new Date().toISOString();
    const type = "PLAY_SIGNAL";

    setTrialData(prev => [...prev, { amplitude: currentAmplitude, hasSignal:"", correct:"", timestamp:timestamp, type:type}]);

    // choose random actuator
    const actuator = Math.floor(Math.random() * NUM_ACTUATORS);
    // create an array of 6 values, all 0 except the chosen actuator
    console.log("Actuator:", NUM_ACTUATORS);
    const amplitudes = Array.from({ length: NUM_ACTUATORS }, (_, i) => i === actuator ? currentAmplitude : 0);
    const message = JSON.stringify({
      amplitudes,
      timestamp: Date.now(),
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
      setHasBeenPlayed(true);
    } else {
      console.log("Websocket not connected");
    }
  };

  const handleResponse = (hasSignal) => {
    console.log("Response:", hasSignal);
    console.log("Real signal:", hasRealSignal);
    const correct = (hasSignal === hasRealSignal);
    const timestamp = new Date().toISOString();
    const type = "GUESS"

    setTrialData(prev => [...prev, { amplitude: currentAmplitude, hasSignal:hasRealSignal, correct:correct, timestamp:timestamp, type:type}]);

    // randomly determine if there is a real signal for next trial
    const s = Math.random() < 0.5;
    setHasRealSignal(s);

    if (correct) {
      const newAmplitude = Math.round((currentAmplitude - stepSize) * 10) / 10;
      if (newAmplitude < bestAmplitude) {
        setBestAmplitude(newAmplitude);
        setErrorCount(0);
      }
      setCurrentAmplitude(newAmplitude);
    } else {
      setCurrentAmplitude(prev => prev + (stepSize / 2));
      setErrorCount(prev => prev + 1);
    }

    // Check if error threshold reached
    if (errorCount + (correct ? 0 : 1) >= errorsAccepted) {
      alert("Staircase ended. Errors accepted threshold reached.");
      setExperimentEnded(true);
    }

    setHasBeenPlayed(false);
  };

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (message) => {
      console.log('Received from server:', message.data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    return () => {
      ws.close();
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
    const headers = ["Timestamp", "Amplitude", "WasPlayingSignal", "Correct", "Type"];
    const rows = trialData.map(t => [t.timestamp, t.amplitude, t.hasSignal, t.correct, t.type]);

    let csvContent = headers.join(",") + "\n";
    rows.forEach(r => {
      csvContent += r.join(",") + "\n";
    });

    //save on another page the project configuration
    const headers2 = ["Start Amplitude", "Step Size", "Errors Accepted", "Best Amplitude"];
    const rows2 = [[startAmplitude, stepSize, errorsAccepted, bestAmplitude]];

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
              {hasBeeenPlayed && (
                <div className="responseButtons">
                  <p>Did you hear a signal?</p>
                  <button className="responseButton" onClick={() => handleResponse(true)}>Signal</button>
                  <button className="responseButton" onClick={() => handleResponse(false)}>No Signal</button>
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
                {/* Add text for number of errors */}
                <text
                  x={plotWidth - padding}
                  y={padding / 2}
                  textAnchor="end"
                  fill="black"
                >
                  Errors: {errorCount}
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
              <label>Errors Accepted:</label>
              <input
                type="number"
                value={errorsAccepted}
                onChange={e => setErrorsAccepted(parseInt(e.target.value))}
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
