import { useState } from "react";

export function Rendering() {
  console.log("rendering");

  return <Rendering2 />;
}

function Rendering2() {
    console.log("rendering2")
  const [count, setCount] = useState(0);

  return (
    <>
      <p>{count}</p>
      <button onClick={() => setCount(count + 1)}>increment</button>
    </>
  );
}
