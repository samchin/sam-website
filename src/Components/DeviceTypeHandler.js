import React, { useEffect, useState } from 'react';

const DeviceTypeHandler = () => {
  const [deviceType, setDeviceType] = useState('');
  const [error, setError] = useState('');
  
  const validDeviceTypes = ['necklace', 'overear', 'bracelet'];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('DEVICE_TYPE');

    if (!deviceParam) {
      setError('No device type specified. Please add ?DEVICE_TYPE=necklace (or overear/bracelet) to the URL.');
      return;
    }

    if (!validDeviceTypes.includes(deviceParam.toLowerCase())) {
      setError(`Invalid device type. Valid options are: ${validDeviceTypes.join(', ')}`);
      return;
    }

    setDeviceType(deviceParam.toLowerCase());
    setError('');
  }, []);

  return (
    <div className="p-4">
      {error ? (
        <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Selected Device: {deviceType}</h2>
          <div className="grid gap-4">
            {deviceType === 'necklace' && (
              <div className="p-4 border rounded">
                <h3 className="font-semibold">Necklace Configuration</h3>
                {/* Add necklace-specific content here */}
              </div>
            )}
            {deviceType === 'overear' && (
              <div className="p-4 border rounded">
                <h3 className="font-semibold">Over-ear Configuration</h3>
                {/* Add over-ear specific content here */}
              </div>
            )}
            {deviceType === 'bracelet' && (
              <div className="p-4 border rounded">
                <h3 className="font-semibold">Bracelet Configuration</h3>
                {/* Add bracelet-specific content here */}
              </div>
            )}
          </div>
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Try different device types:</h3>
            <div className="space-x-2">
              {validDeviceTypes.map(type => (
                <button
                  key={type}
                  onClick={() => {
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('DEVICE_TYPE', type);
                    window.history.pushState({}, '', newUrl);
                    setDeviceType(type);
                  }}
                  className={`px-4 py-2 rounded ${
                    deviceType === type 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceTypeHandler;