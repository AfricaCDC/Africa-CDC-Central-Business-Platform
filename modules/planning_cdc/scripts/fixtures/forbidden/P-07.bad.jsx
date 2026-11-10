export default function List({ items }) {
  return <ul>{items.map((it, index) => <li key={index}>{it}</li>)}</ul>;
}
