import { Routes, Route, BrowserRouter } from 'react-router-dom';
import './App.css'
import TraceViewer from './TraceViewer';
import { routerBasename } from './publicUrl';

function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <Routes>
        <Route path="*" element={<TraceViewer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
