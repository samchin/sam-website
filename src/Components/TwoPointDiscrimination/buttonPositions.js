import buttonData from '../../data/buttonPositions.json';

export const loadButtonPositions = (deviceType) => {
  return buttonData[deviceType] || null;
};
