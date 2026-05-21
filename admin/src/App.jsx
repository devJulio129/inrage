import { useState, useEffect } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    console.log('component mounted');
  }, [count]);
  
  return (
    <div className="app">
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>+1</button>
      <button onClick  = {() => setCount(count - 1)}>-1</button>
    </div>
  );
}
