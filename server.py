import asyncio
import websockets
import json
import sounddevice as sd
import numpy as np

MAPPING = {
    0: 0,
    1: 1,
    2: 3,
    3: 7,
    4: 6,
    5: 2
}

# Global variable for amplitudes
amplitude_array = [0, 0, 0, 0, 0, 0]

frequency = 170      # Frequency of the sine wave in Hz
sample_rate = 48000   # Sample rate in Hz
phase = 0.0           # Phase accumulator for the sine wave
phase_increment = (2 * np.pi * frequency) / sample_rate

def connect():
    # Attempt to find a device with at least 8 output channels
    device_id = None
    for i, device in enumerate(sd.query_devices()):
        if device['max_output_channels'] >= 8:
            device_id = i
            break
    if device_id is None:
        raise RuntimeError("No suitable output device found with at least 8 channels.")

    sd.default.device = (None, device_id)
    print(f"Selected audio output device with output channels: {sd.query_devices(device_id)['max_output_channels']}")
    print(sd.default.device)


def audio_callback(outdata, frames, time, status):
    global phase, amplitude_array

    if status:
        print("Stream status:", status)

    # Create a time index for this block
    t = (np.arange(frames) + phase) * phase_increment
    # Update phase for the next callback
    phase += frames

    # Create a multi-channel buffer initialized to zeros
    out = np.zeros((frames, sd.query_devices(sd.default.device[1])['max_output_channels']), dtype=np.float32)

    # Generate the sine wave and scale by amplitude for each channel
    sine_wave = np.sin(t)
    for i in range(len(amplitude_array)):
        out[:, MAPPING[i]] = sine_wave * amplitude_array[i]

    outdata[:] = out


async def handler(websocket):
    global amplitude_array
    async for message in websocket:
        data = json.loads(message)
        print("Received data:", data)
        # Update the global amplitude array
        amplitude_array = data["amplitudes"]


async def main():
    async with websockets.serve(handler, "localhost", 8000):
        print("WebSocket server listening on ws://localhost:8000")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    connect()

    # Start the output stream
    with sd.OutputStream(samplerate=sample_rate,
                         channels=sd.query_devices(sd.default.device[1])['max_output_channels'],
                         callback=audio_callback,
                         blocksize=1024):
        # Run the websocket server and the stream at the same time
        asyncio.run(main())
