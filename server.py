import asyncio
import websockets
import json
import sounddevice as sd
import numpy as np



async def main():
    async with websockets.serve(handler, "localhost", 8000):
        print("WebSocket server listening on ws://localhost:8000")
        await asyncio.Future()  # run forever

async def handler(websocket):
    async for message in websocket:
        data = json.loads(message)
        print("Received data:", data)


def connect():
    for i, device in enumerate(sd.query_devices()):
        print(f"{i}: {device['name']} - {device['hostapi']} ({device['max_input_channels']} in, {device['max_output_channels']} out)")

    device_id = None
    for i, device in enumerate(sd.query_devices()):
        if device['max_output_channels'] >= 8:

            device_id = i
            break

    sd.default.device = (None, device_id)

    print(f"Selected audio output device with output channels: {sd.query_devices(device_id)['max_output_channels']}")
    print(sd.default.device)

def play_170Hz(channels):

    output_device_id = sd.default.device[1]  # The second element is the output device ID
    num_output_channels = sd.query_devices(output_device_id)['max_output_channels']

    # making a sine wave

    frequency = 170  # Frequency of the sine wave 
    duration = 1.0  # Duration in seconds
    sample_rate = 48000 # Sample rate in Hz
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

    mono_sine_wave = 0.5 * np.sin(2 * np.pi * frequency * t)

    # Create a multi-channel array with silence in other channels
    output_array = np.zeros((len(mono_sine_wave), num_output_channels))

    # Assume you want to play on the first channel
    output_array[:, 0] = mono_sine_wave

    # Output the sound to the specific channel
    sd.play(output_array, samplerate=sample_rate)
    sd.wait()  # Wait until playback is finished

    



if __name__ == "__main__":
    connect()
    play_170Hz()
    asyncio.run(main())