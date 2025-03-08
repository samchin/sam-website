

import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './Components/Home/Home';
import Circle from './Components/Circle/Circle';
import Absolute from './Components/Absolute/Absolute';
import Relative from './Components/Relative/Relative';
import Localization from './Components/Localization/Localization';
import TwoPointDiscrimination from './Components/TwoPointDiscrimination/TwoPointDiscrimination'; //EMMIE ADDED TESTING


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/circle" element={<Circle />} />
        <Route path="/absolute" element={<Absolute/>} />
        <Route path="/relative" element={<Relative/>} />
        { <Route path="/localization" element={<Localization/>} /> }
        <Route path="/two-point" element={<TwoPointDiscrimination/>} /> 
      </Routes>
    </Router>
  );
}

export default App;

