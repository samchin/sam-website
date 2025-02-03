import asyncio
import websockets
import json
import numpy as np
import pandas as pd
import flask
from flask_cors import CORS
import threading
from dotenv import load_dotenv
import os
import logging

load_dotenv("./.env")

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)
# Retrieve environment variables
DEBUG = False
FREQ = int(os.getenv("REACT_APP_FREQ", 200))
SAMPLE_RATE = int(os.getenv("REACT_APP_SAMPLE_RATE", 2000))
NUMBER_ACTUATORS = int(os.getenv("REACT_APP_NUMBER_ACTUATOR", 0))

WINDOW_SIZE = int(os.getenv("REACT_APP_WINDOW_SAVING", 10000))

# Parse MAPPING as a dictionary
# # mapping_str = os.getenv("MAPPING", "0,1,2,3,4,5")
# # mapping_str = ("1,2,3,4.5,6")
# # mapping_str = ("2,3,4,5,6,7")
mapping_str = ("2,3,5,7,6,4") # OVER THE EAR
# mapping_str =("2,3,5,4,6,7") 
MAPPING = {i: int(v) for i, v in enumerate(mapping_str.split(","))}

df = pd.DataFrame({
})
# Global variable for amplitudes
amplitude_array = []
phase = 0.0           # Phase accumulator for the sine wave
phase_increment = (2 * np.pi * FREQ) / SAMPLE_RATE

if not DEBUG:
    import sounddevice as sd

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
    print("HELLOOOOOOO")
    global phase, amplitude_array

    return
    if status:
            print("Stream status:", status)
            
            
    # Create a multi-channel buffer initialized to zeros
    # out = np.zeros((frames, sd.query_devices(sd.default.device[1])['max_output_channels']), dtype=np.float32)

    outdata[:] = np.zeros_like(outdata)

    print(len(amplitude_array))

    while len(amplitude_array) > 0 and frames > 0: 

        duration = amplitude_array[0][0]
        this_frames = min(duration, frames)

        # Create a time index for this block
        t = (np.arange(this_frames) + phase) * phase_increment

        # Update phase for the next callback
        phase += this_frames

        # Generate the sine wave and scale by amplitude for each channel
        sine_wave = np.sin(t)
        channel_data = amplitude_array[0][1:]
        for i in range(len(channel_data)):
            outdata[:this_frames, MAPPING[i]] = sine_wave * channel_data[i]

        outdata = outdata[this_frames:]

        frames -= this_frames 
        amplitude_array[0][0] -= this_frames

        if amplitude_array[0][0] == 0: 
            print("POPPING!")
            amplitude_array.pop()


async def handler(websocket):
    print("Client connected.")
    global amplitude_array, df

    # amplitude_array = [0] * NUMBER_ACTUATORS 
    amplitude_array = []
    duration_array = [0] * NUMBER_ACTUATORS
    async for message in websocket:
        data = json.loads(message)
        print("Received data:", data)
        # Update the global amplitude array
        duration = data["duration"]*SAMPLE_RATE/1000
        duration = int(duration)
        amplitude_array.append([duration] + data["amplitudes"])
        # print(duration)
        timestamp = data["timestamp"]
        # duration_array = data["duration"]

        # Update the global dataframe
        new_data = pd.DataFrame([{
            "timestamp": timestamp,
            "amplitudes": data["amplitudes"],
            "duration": data["duration"],
        }])

        df = pd.concat([df, new_data], ignore_index=True)
        df = df[df["timestamp"] > timestamp - WINDOW_SIZE]


async def main():
    #launch a new thread for the HTTP server
    print("Starting Flask server on port 5000")
    threading.Thread(target=lambda: app.run(port=5000)).start()

    async with websockets.serve(handler, "localhost", 8000):
        print("WebSocket server listening on ws://localhost:8000")
        await asyncio.Future()  # run forever

app = flask.Flask(__name__)
CORS(app)

@app.route('/data', methods=['GET'])
def data():
    global df
    return df.to_json(orient='records')


if __name__ == "__main__": 
    if len(MAPPING) != NUMBER_ACTUATORS:
        raise ValueError("Number of actuators in MAPPING does not match NUMBER_ACTUATORS")

    if not DEBUG:
        connect()  
        print("Running in audio output mode.")
        with sd.OutputStream(samplerate=SAMPLE_RATE,
                            channels=sd.query_devices(sd.default.device[1])['max_output_channels'],
                             blocksize=1024):
            asyncio.run(main())
    else:
        print("Running in debug mode. No audio output will be generated.")
        asyncio.run(main())
