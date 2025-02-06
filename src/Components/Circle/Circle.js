import React, { useEffect, useRef, useState } from 'react';
import './Circle.css';
import ActuatorChart from './ActuatorChart';
import '../DeviceTypeHandler'
//convert to integer
const NUM_ACTUATORS = parseInt(process.env.REACT_APP_NUMBER_ACTUATOR);
const CIRCLE_RADIUS = 200; // px
const TRAIL_DURATION = 100; // ms
const UPDATE_INTERVAL = parseInt(process.env.REACT_APP_SENDING_RATE); // ms
const REFRESH_RATE = parseInt(process.env.REACT_APP_REFRESH_RATE); // ms
const TIME_WINDOW = parseInt(process.env.REACT_APP_WINDOW_SAVING); // 10 seconds in ms
const SERVER_URL = process.env.REACT_APP_SERVER_URL;


console.log('NUM_ACTUATORS:', NUM_ACTUATORS);

function Circle() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, inside: false });
  const [trail, setTrail] = useState([]); // {x, y, time}
  const circleRef = useRef(null);
  const wsRef = useRef(null);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const mousePosRef = useRef(mousePos); // Ref to hold latest mousePos
  const [dragging, setDragging] = useState(false);
  const [dataActuators, setDataActuators] = useState([]);
  const [numActuators, setNumActuators] = useState(0);
  const [actuatorsDataArray, setActuatorsDataArray] = useState([]);
  const [sendData, setSendData] = useState(true); // Toggle state for sending data
  const [deviceType, setDeviceType] = useState('');


  // Keep track of start time to send a duration in messages
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('DEVICE_TYPE');
    const validDeviceTypes = ['necklace', 'overear', 'bracelet'];
  
    if (deviceParam && validDeviceTypes.includes(deviceParam.toLowerCase())) {
      setDeviceType(deviceParam.toLowerCase());
    }
  }, []);

  useEffect(() => {
    // Determine center after mount
    const rect = circleRef.current.getBoundingClientRect();
    setCenter({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, []);

  useEffect(() => { //connection to the HTTP server
    // Fetch data periodically
    const fetchData = () => {
      fetch(SERVER_URL+'/data')
        .then((response) => response.json())
        .then((fetchedData) => {
          setDataActuators(fetchedData);
        })
        .catch((error) => console.error('Error fetching data:', error));
    };

    const intervalId = setInterval(fetchData, REFRESH_RATE);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => { //data transformation
    if (!dataActuators || dataActuators.length === 0) return;

    // Determine number of actuators
    const first = dataActuators[0];
    if (first && first.amplitudes && first.amplitudes.length > 0) {
      setNumActuators(first.amplitudes.length);
    }

    // Now transform data for each actuator
    const now = Date.now();
    const cutoff = now - TIME_WINDOW;

    // We'll maintain arrays for each actuator
    // Initialize arrays if needed
    let newActuatorsData = [];
    for (let i = 0; i < (first?.amplitudes.length || 0); i++) {
      newActuatorsData[i] = [];
    }

    dataActuators.forEach(d => {
      const t = d.timestamp;
      if (t >= cutoff) {
        d.amplitudes.forEach((amp, i) => {
          const freq = amp;
          const duty = amp;

          newActuatorsData[i].push({
            timestamp: t / 1000, // Chart code expects timestamp in seconds (assuming so from *1000 in code)
            freq: freq,
            duty: duty,
          });
        });
      }
    });

    setActuatorsDataArray(newActuatorsData);
  }, [dataActuators]);

  // Mouse event listener
  useEffect(() => {
    const handleMouseDown = () => setDragging(true);
    const handleMouseUp = () => setDragging(false);
    const handleMouseMove = (e) => {
      if (!dragging) return;
      let dx = e.clientX - center.x;
      let dy = e.clientY - center.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      let inside = dist <= CIRCLE_RADIUS;
      if (!inside)
      {
        //make it bounded to the circle
        const angle = Math.atan2(dy, dx);
        dx = CIRCLE_RADIUS * Math.cos(angle);
        dy = CIRCLE_RADIUS * Math.sin(angle);
        dist = CIRCLE_RADIUS;
        inside = true;
      }
      setMousePos({ x: dx, y: dy, inside });
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [center, dragging]);

  // Update trail
  useEffect(() => {
    const now = Date.now();
    setTrail((prevTrail) => {
      const filtered = prevTrail.filter((pt) => now - pt.time < TRAIL_DURATION);
      if (mousePos.inside) {
        filtered.push({ x: mousePos.x, y: mousePos.y, time: now });
      }
      return filtered;
    });
  }, [mousePos]);

  // Update the mousePosRef whenever mousePos changes
  useEffect(() => {
    mousePosRef.current = mousePos;
  }, [mousePos]);

  useEffect(() => {   // Set up WebSocket connection
    const ws = new WebSocket('ws://localhost:8000'); // Change URL as needed
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

  // Set the interval once and use the ref to get updated mousePos
  useEffect(() => {
    const interval = setInterval(() => {
      if (!sendData) return; // Check the toggle before sending data

      const { x, y, inside } = mousePosRef.current;
      const amplitudes = computeAmplitudes(x, y, inside);
      const message = JSON.stringify({
        device: deviceType,
        amplitudes,
        timestamp: Date.now(),
        duration: UPDATE_INTERVAL 
      });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(message);
      }
    }, UPDATE_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [startTime, sendData]); // Depend on sendData to update interval when toggle changes

  // Generate actuator points
  const actuatorPoints = [];
  for (let i = 0; i < NUM_ACTUATORS; i++) {
    const angle = (360 / NUM_ACTUATORS) * i;
    const rad = (angle * Math.PI) / 180;
    const ax = CIRCLE_RADIUS * Math.cos(rad);
    const ay = CIRCLE_RADIUS * Math.sin(rad);
    actuatorPoints.push({ x: ax, y: ay });
  }

  const trailPath = generateTrailPath(trail);

  return (
    <div className="cirlceapp">
      
      <div className="circleheader">
      <div className="deviceType">Device: {deviceType}</div>
        <div className="containercircle">
          {/* Toggle switch for sending data */}
          <svg
            ref={circleRef}
            width={CIRCLE_RADIUS * 2}
            height={CIRCLE_RADIUS * 2}
            style={{ overflow: 'visible' }}
          >
            <circle
              cx={CIRCLE_RADIUS}
              cy={CIRCLE_RADIUS}
              r={CIRCLE_RADIUS}
              className="main-circle"
            />
            {actuatorPoints.map((p, i) => (
              <circle
                key={i}
                cx={CIRCLE_RADIUS + p.x}
                cy={CIRCLE_RADIUS + p.y}
                r={8}
                className="actuator-point"
              />
            ))}
            {trailPath && <path d={trailPath} className="mouse-trail" />}
            {mousePos.inside && (
              <circle
                cx={CIRCLE_RADIUS + mousePos.x}
                cy={CIRCLE_RADIUS + mousePos.y}
                r={4}
                className="current-position"
              />
            )}
          </svg>
        </div>
        <div className="toggle-container">
          <label className="switch">
            <input type="checkbox" checked={sendData} onChange={() => setSendData(!sendData)} />
            <span className="slider round"></span>
          </label>
          <p>Send Data</p>
        </div>
      </div>
      <div className='actuator-charts'>
        <h1>Actuator Charts</h1>
        {/* Dynamically render one chart per actuator */}
        {actuatorsDataArray.map((actData, index) => (
          <div className='actuator-chart-container'>
            <ActuatorChart
              key={index}
              actuatorAddr={index}
              actuatorData={actData}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function computeAmplitudes(dx, dy, inside) {
  const amplitudes = new Array(NUM_ACTUATORS).fill(0);
  if (!inside) return amplitudes;

  const dist = Math.sqrt(dx * dx + dy * dy);
  const radiusFactor = dist / CIRCLE_RADIUS;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const normalizedAngle = (angleDeg + 360) % 360;

  const step = 360 / NUM_ACTUATORS;
  let lowerIndex = Math.floor(normalizedAngle / step);
  let upperIndex = (lowerIndex + 1) % NUM_ACTUATORS;

  const lowerAngle = lowerIndex * step;
  const upperAngle = upperIndex * step;

  let angleDiff = upperAngle - lowerAngle;
  if (angleDiff < 0) {
    angleDiff += 360;
  }

  let relAngle = normalizedAngle - lowerAngle;
  if (relAngle < 0) {
    relAngle += 360;
  }

  const weightLower = (angleDiff - relAngle) / angleDiff;
  const weightUpper = relAngle / angleDiff;

  amplitudes[lowerIndex] = radiusFactor * weightLower;
  amplitudes[upperIndex] = radiusFactor * weightUpper;

  return amplitudes;
}


function generateTrailPath(trail) {
  if (trail.length < 2) return null;
  let d = `M ${CIRCLE_RADIUS + trail[0].x} ${CIRCLE_RADIUS + trail[0].y}`;
  for (let i = 1; i < trail.length; i++) {
    d += ` L ${CIRCLE_RADIUS + trail[i].x} ${CIRCLE_RADIUS + trail[i].y}`;
  }
  return d;
}

export default Circle;
