import { useEffect, useState } from 'react';
export default function X() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/x').then(r => r.json()).then(setData); }, []);
  return <div>{data?.name}</div>;
}
