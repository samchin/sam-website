import React, { useState } from 'react';
import './Experiment.css';

const Experiment = () => {
  const [examinatorMode, setExaminatorMode] = useState(true);
  const [startAmplitude, setStartAmplitude] = useState(1.0);
  const [stepSize, setStepSize] = useState(0.1);
  const [errorsAccepted, setErrorsAccepted] = useState(5);
  const [hasRealSignal, setHasRealSignal] = useState(false);

  const [bestAmplitude, setBestAmplitude] = useState(startAmplitude);

  const [currentAmplitude, setCurrentAmplitude] = useState(startAmplitude);
  const [trialData, setTrialData] = useState([]); // {amplitude, correct: boolean} objects
  const [errorCount, setErrorCount] = useState(0);
  const [experimentStarted, setExperimentStarted] = useState(false);
  
  // Handle start of experiment
  const handleStart = () => {
    const s = Math.random() < 0.5;
    setHasRealSignal(s);

    setBestAmplitude(startAmplitude);
    setExperimentStarted(true);
    setExaminatorMode(false);
    setCurrentAmplitude(startAmplitude);
    setTrialData([]);
    setErrorCount(0);
    
  };

  // Simulate playing the sound (for now, just a console.log)
  const handlePlay = () => {
    console.log("Playing sound at amplitude:", currentAmplitude);
  };

  const handleResponse = (hasSignal) => {
    console.log("Response:", hasSignal);
    console.log("Real signal:", hasRealSignal);
    const correct = (hasSignal === hasRealSignal);
    setTrialData(prev => [...prev, { amplitude: currentAmplitude, correct }]);

    //randomly determine if there is a real signal
    const s = Math.random() < 0.5;
    setHasRealSignal(s);
    
    if (correct) {
        //1 decimal after the comma
        const newAmplitude = Math.round((currentAmplitude - (stepSize)) * 10) / 10;
        
        console.log(newAmplitude, bestAmplitude);
        if (newAmplitude < bestAmplitude) {
            setBestAmplitude(newAmplitude);
            setErrorCount(0);
        }
        setCurrentAmplitude(newAmplitude);
    } else {
        setCurrentAmplitude(prev => prev + (stepSize / 2));
        setErrorCount(prev => prev + 1);
    }

    if (errorCount >= errorsAccepted) {
        alert("Staircase ended. Errors accepted threshold reached.");
    }
  };

  // Plot dimensions
  const plotWidth = 500;
  const plotHeight = 200;
  const padding = 30;

  // Calculate maximum and minimum amplitude
  const maxAmplitude = Math.max(...trialData.map(t => t.amplitude)) + 2*stepSize;
  const minAmplitude = Math.min(...trialData.map(t => t.amplitude)) - 2*stepSize;

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

  return (
    <div className="container">
      {/* Examinator mode toggle (always visible) */}
      <button className="examinatorToggle" onClick={() => setExaminatorMode(!examinatorMode)}>
        Examinator
      </button>


      {/* Main experiment view */}
      {(
        <div className="experimentArea">
          <div className="controlRow">
            <button className="playButton" onClick={handlePlay}>Play</button>
            
            <div className="responseButtonsContainer">
                <button className="responseButton" onClick={() => handleResponse(true)}>Signal</button>
                <button className="responseButton" onClick={() => handleResponse(false)}>No Signal</button>
            </div>
           </div>
        </div>
      )}

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
                    <title>{`Trial ${i+1}: Amp=${trialData[i].amplitude}, ${p.correct ? 'Correct' : 'Incorrect'}`}</title>
                  </circle>
                ))}
                {/* Add a horizontal line for best amplitude */}
                <line 
                  x1={padding} 
                  y1={
                    trialData.length > 1
                      ? padding + ((maxAmplitude - bestAmplitude) / (maxAmplitude - minAmplitude)) * (plotHeight - 2 * padding)
                      : plotHeight / 2
                  }
                  x2={plotWidth - padding}
                  y2={
                    trialData.length > 1
                      ? padding + ((maxAmplitude - bestAmplitude) / (maxAmplitude - minAmplitude)) * (plotHeight - 2 * padding)
                      : plotHeight / 2
                  }
                  stroke="orange" 
                  strokeWidth="2"
                  strokeDasharray="5,5"
                />
                {/* Add text for best amplitude */}
                <text 
                  x={padding} 
                  y={
                    trialData.length > 1
                      ? padding + ((maxAmplitude - bestAmplitude) / (maxAmplitude - minAmplitude)) * (plotHeight - 2 * padding) - 10
                      : plotHeight / 2 - 10
                  } 
                  fill="orange" 
                  fontSize="12"
                >
                  Best Amplitude: {bestAmplitude}
                </text>
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
            <button className="startButton" onClick={handleStart}>Start</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Experiment;
