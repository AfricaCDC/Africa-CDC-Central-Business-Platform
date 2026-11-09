export default function List({ items }) {
  return <ul>{items.map((it) => <li key={it.id}>{it.name}</li>)}</ul>;
}
