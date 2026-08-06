export function MetricCard(props: { label: string; value: number }) {
  return (
    <dl>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </dl>
  );
}
