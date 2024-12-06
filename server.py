import asyncio
import websockets
import json



async def main():
    async with websockets.serve(handler, "localhost", 8000):
        print("WebSocket server listening on ws://localhost:8000")
        await asyncio.Future()  # run forever

async def handler(websocket):
    async for message in websocket:
        data = json.loads(message)
        print("Received data:", data)



if __name__ == "__main__":
    asyncio.run(main())