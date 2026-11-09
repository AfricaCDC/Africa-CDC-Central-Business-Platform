import { useXQuery } from '../hooks/useXQueries';
export default function X() {
  const { data } = useXQuery();
  return <div>{data?.name}</div>;
}
