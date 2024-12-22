import React, { useState, useRef, useEffect } from 'react';
import TinderCard from 'react-tinder-card';
import './Relative.css';
import { set } from 'date-fns';


const NUMBER_OF_CARDS = 3; // Number of cards to display initially
const ID_ACTUATOR_A = 0;
const ID_ACTUATOR_B = 1;
const STEP_SIZE = 0.1;
const REVERSAL = 4;
const DIFFERENCE = 0.1;
const NUM_ACTUATORS = 6;

function Relative() {
  // State to keep track of unique IDs for new cards

  const [lastDirection, setLastDirection] = useState(null);
  const [lastSwipedCard, setLastSwipedCard] = useState(null);
  const [data, setData] = useState([]);
  const [lastId, setLastId] = useState(0);
  const containerRef = useRef();
  const [amplitude, setAmplitude] = useState(1);

  const [errorCount, setErrorCount] = useState(0);
  const [bestAmplitude, setBestAmplitude] = useState(1);

  const wsRef = useRef(null);


  // Reference to the container to calculate canvas size
  const canGoBack = lastSwipedCard != null;
  const canSwipe = data.length > 0;
  const childRefs = useRef([]);

  useEffect(() => {
    const fetchData = async () => {
      const initialData = [];
      for (let i = 0; i < NUMBER_OF_CARDS; i++) {
        const car = spawnCardsInfo(i);
        initialData.push(car);
      }
      setData(initialData);
    };

    fetchData();
    setLastId(NUMBER_OF_CARDS - 1);
  }, []);

  const spawnCardsInfo = (id) => {
    const isActuatorA = Math.random() < 0.5;
    const car = { id: id, name: `Card ${id}`, isActuatorA: isActuatorA }

    setLastId(lastId + 1);

    return car;
  };

  const sendInfo = () => {
    const timestamp = new Date().toISOString();

    //make an array of length NUM_ACTUATORS with 0
    const amplitudes = Array(NUM_ACTUATORS).fill(0);
    //at the index of the actuator, set the amplitude
    amplitudes[ID_ACTUATOR_A] = amplitude;
    amplitudes[ID_ACTUATOR_B] = amplitude - DIFFERENCE;

    const message = JSON.stringify({
      amplitudes,
      timestamp: Date.now(),
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      console.log("Websocket not connected");
    }
  };

    useEffect(() => {
      const ws = new WebSocket('ws://localhost:8000');
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
  

  // Update childRefs whenever data changes
  useEffect(() => {
    childRefs.current = data.map((_, i) => childRefs.current[i] || React.createRef());
  }, [data]);

  // Handle swipe event
  const swiped = async (direction, idToDelete) => {
    setLastDirection(direction);


    // The top card is data[0]
    const swipedCard = data[0];
    setLastSwipedCard(swipedCard);

    const correctDirection = swipedCard.isActuatorA ? 'left' : 'right';
    const isCorrect = direction == correctDirection;

    setNewAmplitude(isCorrect);

    // Remove the first card from data
    const newData = data.slice(1);

    // Add a new card to the end
    const newCharacter = spawnCardsInfo(lastId + 1);
    newData.push(newCharacter);

    setData(newData);
  };

  // Handle card leaving the screen
  const outOfFrame = (name, idx) => {
    console.log(`${name} (${idx}) left the screen!`);
  };

  const setNewAmplitude = (correct) => {
    if (correct) {
      const newAmplitude = Math.round((amplitude - STEP_SIZE) * 10) / 10;
      if (newAmplitude < bestAmplitude) {
        setBestAmplitude(newAmplitude);
        setErrorCount(0);
      }
      setAmplitude(newAmplitude);
    } else {
      setAmplitude(prev => prev + (STEP_SIZE / 2));
      setErrorCount(prev => prev + 1);
    }
  };

  // Function to programmatically swipe the top card
  const swipe = async (dir) => {
    if (canSwipe && childRefs.current[0].current) {
      await childRefs.current[0].current.swipe(dir);
    }
  };

  // Function to undo the last swipe
  const goBack = async () => {
    setLastSwipedCard(null);
    if (!canGoBack) return;

    // Re-insert the last swiped card at the beginning
    const newData = [lastSwipedCard, ...data];
    setData(newData);

    // Restore the card animation
    await childRefs.current[0].current.restoreCard();

    
  };

  const onCardPress = async (id) => {
    console.log('Card pressed: ' + id);
    const array = data.find((d) => d.id === id);

    console.log("isActuatorA: " + array.isActuatorA);
    const actuatorA = array.isActuatorA ? amplitude : amplitude - DIFFERENCE;
    const actuatorB = array.isActuatorA ? amplitude - DIFFERENCE : amplitude;
    console.log('Amplitude A: ' + actuatorA, 'Amplitude B: ' + actuatorB);

    sendInfo();
  
  }

  // Function to calculate canvas size based on container size
  const getCanvasSize = () => {
    if (!containerRef.current) return 200;
    const { offsetWidth, offsetHeight } = containerRef.current;
    return Math.min(offsetWidth, offsetHeight); // Use the smaller dimension
  };

  return (
    <div className='relative'>
      <div className='tinderSound'>
        <h1>Sound Tinder Map</h1>
        <div className='cardContainer' ref={containerRef}>
          {data
            .map((character, index) => ({ character, index }))
            .reverse() // Render first element last so it's on top
            .map(({ character, index }) => (
              <TinderCard
                ref={childRefs.current[index]}
                className='swipe pressable'
                key={character.id}
                onSwipe={(dir) => swiped(dir, character.id)}
                onCardLeftScreen={() => outOfFrame(character.name, index)}
                preventSwipe={['up', 'down']}
              >
                <div
                  style={{
                  }}
                  className='card'
                >

                <button
                        className='playButton'
                        onClick={() => {
                          onCardPress(character.id); // Ensure soundUrl is a property of character
                        }}
                        style={{
                          backgroundColor: !canSwipe ? '#c3c4d3' : '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '50%',
                          height: '50%',
                          cursor: 'pointer',
                        }}>
                          Play
                  </button>

                  <h3>{character.name}</h3>
                </div>
              </TinderCard>
            ))}
        </div>
        <div className='buttons'>
          <button
            style={{ backgroundColor: !canSwipe && '#c3c4d3' }}
            onClick={() => swipe('left')}
            disabled={!canSwipe}
          >
            Not this shape!
          </button>
          <button
            style={{ backgroundColor: !canGoBack && '#c3c4d3' }}
            onClick={() => goBack()}
            disabled={!canGoBack}
          >
            Undo swipe!
          </button>
          <button
            style={{ backgroundColor: !canSwipe && '#c3c4d3' }}
            onClick={() => swipe('right')}
            disabled={!canSwipe}
          >
            Yes this shape!
          </button>
        </div>
        {lastDirection ? (
          <h2 key={lastDirection} className='infoText'>
            {lastDirection === 'left' ? 'You said not this shape' : 'You said it was this shape'}
          </h2>
        ) : (
          <h2 className='infoText'>
            Swipe a card or press a button to get Restore Card button visible!
          </h2>
        )}
      </div>
    </div>
  );
}

export default Relative;