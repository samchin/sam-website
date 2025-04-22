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
from pydub import AudioSegment
import math
from scipy.signal import resample

load_dotenv("./.env")

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)
# Retrieve environment variables
DEBUG = False
FREQ = int(os.getenv("REACT_APP_FREQ", 200))
SAMPLE_RATE = int(os.getenv("REACT_APP_SAMPLE_RATE", 2000))
NUMBER_ACTUATORS = int(os.getenv("REACT_APP_NUMBER_ACTUATOR", 6))  # Changed to 6 for the 6 motors

WINDOW_SIZE = int(os.getenv("REACT_APP_WINDOW_SAVING", 10000))

# Parse MAPPING as a dictionary
# mapping_str = os.getenv("MAPPING", "0,1,2,3,4,5")
mapping_str_gabrielle = ("0,1,3,7,6,2")
mapping_str = mapping_str_gabrielle

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
            # if device['max_output_channels'] == 2: 
                device_id = i
                break
        if device_id is None:
            raise RuntimeError("No suitable output device found with at least 8 channels.")

        sd.default.device = (None, device_id)
        print(f"Selected audio output device with output channels: {sd.query_devices(device_id)['max_output_channels']}")
        print(sd.default.device)


def audio_callback(outdata, frames, time, status):
    """
    Audio callback function for sounddevice to generate sine waves with varying amplitudes per channel.
    
    Args:
        outdata (numpy.ndarray): Output buffer to fill with audio data
        frames (int): Number of frames to generate
        time (CData): Time information (from sounddevice)
        status (CallbackFlags): Status flags
        
    Global variables used:
        phase (int): Current phase of the sine wave
        amplitude_array (list): List of [duration, amp_ch1, amp_ch2, ...] arrays
        MAPPING (list): Channel mapping for output
    """
    global phase, amplitude_array
    
    if status:
        print("Stream status:", status)
    
    # Initialize output buffer with zeros
    outdata.fill(0)
    
    # Keep track of how many frames we've processed
    frames_processed = 0
    
    while len(amplitude_array) > 0 and frames_processed < frames:
        # Get current amplitude array data
        duration = amplitude_array[0][0]
        remaining_frames = frames - frames_processed
        this_frames = min(duration, remaining_frames)
        
        # Generate time indices for this block
        t = (np.arange(this_frames) + phase) * phase_increment
        phase += this_frames
        
        # Generate base sine wave
        sine_wave = np.sin(t)
        
        # Apply amplitudes to each channel
        channel_data = amplitude_array[0][1:]
        for i, amplitude in enumerate(channel_data):
            if i < len(MAPPING):
                outdata[frames_processed:frames_processed + this_frames, MAPPING[i]] = sine_wave * amplitude
        
        # Update counters and check if we're done with current amplitude array
        frames_processed += this_frames
        amplitude_array[0][0] -= this_frames
        
        if amplitude_array[0][0] <= 0:
            amplitude_array.pop(0)
            
    return


def play_audio_across_actuators(audio_file_path, overlap_percent=0, amplitude_scaling=1.0, 
                               smooth_transition=True, loop_count=1):
    """
    Load an audio file and distribute it across the 6 actuators sequentially with customizable options.
    
    Args:
        audio_file_path (str): Path to the audio file (.m4a or other format)
        overlap_percent (float): Percentage of overlap between segments (0-100)
        amplitude_scaling (float): Scaling factor for amplitudes (0-10)
        smooth_transition (bool): If True, applies fade in/out between segments
        loop_count (int): Number of times to loop the pattern (left to right)
    
    Returns:
        None: Updates the global amplitude_array variable
    """
    global amplitude_array
    
    # Load the audio file using pydub
    audio = AudioSegment.from_file(audio_file_path)
    
    # Convert stereo to mono if needed
    if audio.channels > 1:
        audio = audio.set_channels(1)
    
    # Get audio samples as numpy array (normalized to -1.0 to 1.0)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
    
    # Calculate duration of each segment (in milliseconds)
    total_duration_ms = len(audio)
    base_segment_ms = total_duration_ms / 6  # Base duration without overlap
    
    # Adjust segment duration for overlap
    if overlap_percent > 0:
        overlap_factor = overlap_percent / 100.0
        # Extended duration accounting for overlap
        segment_ms = base_segment_ms / (1 - (overlap_factor * 5/6))
        segment_overlap_ms = segment_ms * overlap_factor
    else:
        segment_ms = base_segment_ms
        segment_overlap_ms = 0
    
    # Calculate segment length in samples
    sample_rate = audio.frame_rate
    segment_samples = int((segment_ms / 1000) * sample_rate)
    overlap_samples = int((segment_overlap_ms / 1000) * sample_rate)
    
    # Calculate segment duration in frames (for the amplitude_array)
    segment_frames = int((segment_ms / 1000) * SAMPLE_RATE)
    
    # Clear existing amplitude array
    amplitude_array = []
    
    # Process each segment and loop as requested
    for loop in range(loop_count):
        direction = 1  # 1 for left to right, -1 for right to left
        
        # Forward direction (motor 0 to 5)
        if loop % 2 == 0 or loop_count == 1:
            motor_sequence = range(6)
        # Reverse direction for alternating loops (motor 5 to 0)
        else:
            motor_sequence = range(5, -1, -1)
            
        for motor_idx, i in enumerate(motor_sequence):
            # Calculate segment start position in original samples
            # This is where we distribute the original audio across motors
            start_pos = int((total_duration_ms * i / 6) / 1000 * sample_rate)
            
            # Ensure we don't go past the end of the sample array
            if start_pos >= len(samples):
                start_pos = len(samples) - segment_samples
                
            # Extract segment with appropriate length
            end_pos = min(start_pos + segment_samples, len(samples))
            segment = samples[start_pos:end_pos]
            
            # If we didn't get enough samples, pad with zeros
            if len(segment) < segment_samples:
                segment = np.pad(segment, (0, segment_samples - len(segment)))
            
            # Apply fade in/out for smooth transitions if requested
            if smooth_transition:
                fade_samples = min(int(segment_samples * 0.1), 200)  # 10% fade or max 200 samples
                
                # Create fade in/out windows
                fade_in = np.linspace(0, 1, fade_samples)
                fade_out = np.linspace(1, 0, fade_samples)
                
                # Apply fades
                segment[:fade_samples] *= fade_in
                segment[-fade_samples:] *= fade_out
            
            # Calculate RMS amplitude for this segment
            rms = math.sqrt(np.mean(np.square(segment)))
            # Scale amplitude between 0 and 1, allowing scaling factor up to 10
            # Apply scaling but ensure final value is between 0 and 1
            amplitude = rms * min(amplitude_scaling, 10.0)  # Allow scaling up to 10
            amplitude = min(amplitude, 1.0)  # But ensure final value doesn't exceed 1.0
            amplitude = max(0.0, amplitude)  # Ensure it's not negative
            
            # Create amplitude array with zeros for all motors except the current one
            actuator_amplitudes = [0.0] * 6
            actuator_amplitudes[i] = amplitude
            
            # Add to amplitude array: [duration, amp1, amp2, amp3, amp4, amp5, amp6]
            amplitude_array.append([segment_frames] + actuator_amplitudes)
    
    print(f"Audio file distributed across 6 actuators with {loop_count} loops")
    print(f"First few amplitude entries: {amplitude_array[:3]}")


async def handler(websocket):
    print("Client connected.")
    global amplitude_array, df

    amplitude_array = []
    duration_array = [0] * NUMBER_ACTUATORS

    async for message in websocket:
        data = json.loads(message)
        print("Received data:", data)
        
        # Check if this is an audio playback request
        if data.get("type") == "play_audio":
            # Handle audio playback request
            audio_file = data.get("audio_file", "permit(vb).m4a")
            
            # Play the audio across actuators
            play_audio_across_actuators(
                audio_file,
                overlap_percent=float(data.get("overlap", 20)),
                amplitude_scaling=float(data.get("scaling", 1.5)),
                smooth_transition=bool(data.get("smooth", True)),
                loop_count=int(data.get("loops", 1))
            )
            
            # Acknowledge receipt
            response = {
                "status": "playing",
                "file": audio_file
            }
            await websocket.send(json.dumps(response))
            continue  # Skip normal amplitude processing
        
        # Handle normal amplitude data
        duration = data["duration"]*SAMPLE_RATE/1000
        duration = int(duration)
        amplitude_array.append([duration] + data["amplitudes"])
        timestamp = data["timestamp"]
        device_type = data["device"]

        # Update the global dataframe
        new_data = pd.DataFrame([{
            "device": device_type,
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

@app.route('/play_audio', methods=['GET'])
def play_audio_endpoint():
    play_audio_across_actuators("permit(vb).m4a")
    return {"status": "playing"}

@app.route('/play_audio_advanced', methods=['POST'])
def play_audio_advanced():
    data = flask.request.json
    audio_file = data.get('audio_file', 'permit(vb).m4a')
    overlap = float(data.get('overlap', 20))  # Default 20% overlap
    scaling = float(data.get('scaling', 1.5))  # Default amplitude scaling
    smooth = bool(data.get('smooth', True))  # Default smooth transitions
    loops = int(data.get('loops', 1))  # Default 1 loop
    
    play_audio_across_actuators(
        audio_file, 
        overlap_percent=overlap,
        amplitude_scaling=scaling,
        smooth_transition=smooth,
        loop_count=loops
    )
    
    return {"status": "playing", "config": {
        "file": audio_file,
        "overlap": overlap,
        "scaling": scaling,
        "smooth": smooth,
        "loops": loops
    }}

if __name__ == "__main__": 
    if len(MAPPING) != NUMBER_ACTUATORS:
        print(f"Warning: Mismatch between MAPPING ({len(MAPPING)}) and NUMBER_ACTUATORS ({NUMBER_ACTUATORS})")
        print("Adjusting NUMBER_ACTUATORS to match MAPPING length")
        NUMBER_ACTUATORS = len(MAPPING)

    if not DEBUG:
        connect()  
        print("Running in audio output mode.")
        with sd.OutputStream(samplerate=SAMPLE_RATE,
                            channels=sd.query_devices(sd.default.device[1])['max_output_channels'],
                            callback=audio_callback, blocksize=0):
            asyncio.run(main())
    else:
        print("Running in debug mode. No audio output will be generated.")
        asyncio.run(main())
        