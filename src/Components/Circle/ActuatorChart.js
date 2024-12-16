// ActuatorChart.js
import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';

import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns'; 

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

function ActuatorChart({ actuatorAddr, actuatorData }) {
  // Sort and prepare data
  const sortedData = [...actuatorData].sort((a, b) => a.timestamp - b.timestamp);

  // current time in milliseconds
  const now = Date.now();

  // Only consider data within the last 10 seconds
  const filteredData = sortedData.filter(d => d.timestamp * 1000 >= now - 10000);

  const labels = filteredData.map(d => d.timestamp * 1000);  // store as ms timestamps
  const freqData = filteredData.map(d => d.freq);
  const dutyData = filteredData.map(d => d.duty);

  const data = useMemo(() => ({
    labels,
    datasets: [
      {
        label: `Duty (Actuator ${actuatorAddr})`,
        data: dutyData,
        borderColor: 'green',
        backgroundColor: 'rgba(0, 128, 0, 0.6 )',
        yAxisID: 'y2',
        borderWidth: 0,
        pointRadius: 5
      }
    ]
  }), [labels, freqData, dutyData, actuatorAddr]);

  const options = useMemo(() => ({
    animation: {
      duration: 0
    },
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false
    },
    stacked: false,
    plugins: {
      title: {
        display: true,
        text: `Actuator ${actuatorAddr} Data`
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'second'
        },
        // Show last 10 seconds: from now-10s to now
        min: now - 5000,
        max: now,
        display: false,
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Frequency'
        },
        min: 0,
        max: 1
      },
      y2: {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Duty'
        },
        min: 0,
        max: 1
      }
    }
  }), [actuatorAddr, now]);

  return (
    <>
      <Line data={data} options={options} />
      <div style={{ fontSize: '10px', color: 'black', padding: '5px' }}>
        {actuatorAddr}
      </div>
    </>
  );
}

export default ActuatorChart;
