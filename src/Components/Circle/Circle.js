import React, { useEffect, useRef, useState } from 'react';
import './Circle.css';

const NUM_ACTUATORS = 6;
const CIRCLE_RADIUS = 200; // px
const TRAIL_DURATION = 100; // ms
const UPDATE_INTERVAL = 20; // ms

function Circle() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, inside: false });
  const [trail, setTrail] = useState([]); // {x, y, time}
  const circleRef = useRef(null);
  const wsRef = useRef(null);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const mousePosRef = useRef(mousePos); // Ref to hold latest mousePos
  const [dragging, setDragging] = useState(false);

  // Keep track of start time to send a duration in messages
  const [startTime] = useState(Date.now());

  useEffect(() => {
    // Determine center after mount
    const rect = circleRef.current.getBoundingClientRect();
    setCenter({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, []);

  // Mouse event listener
  useEffect(() => {
    const handleMouseDown = () => setDragging(true);
    const handleMouseUp = () => setDragging(false);
    const handleMouseMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - center.x;
      const dy = e.clientY - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inside = dist <= CIRCLE_RADIUS;
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

  // Set up WebSocket connection
  useEffect(() => {
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
      const { x, y, inside } = mousePosRef.current;
      const amplitudes = computeAmplitudes(x, y, inside);
      const message = JSON.stringify({
        amplitudes,
        duration: Date.now() - startTime,
      });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(message);
      }
    }, UPDATE_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [startTime]); // Only depend on startTime so we don't recreate interval every mouse move

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
      <div className="containercircle">
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
