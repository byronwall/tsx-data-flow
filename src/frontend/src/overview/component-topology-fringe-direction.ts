export function downstreamFringeDirection(
  outwardX: number,
  outwardY: number,
  downstreamDebt: { x: number; y: number },
  strength: number,
  fallbackUnit: number,
) {
  if (strength <= 0) {
    const x = Math.max(0, outwardX);
    const y = Math.max(0, outwardY);
    return x > 0 || y > 0 ? { x, y } : fallbackUnit < .5 ? { x: 1, y: 0 } : { x: 0, y: 1 };
  }
  const scale = Math.max(1, Math.hypot(outwardX, outwardY));
  const diagonalFloor = scale * .22 * strength;
  return {
    x: Math.max(diagonalFloor, outwardX) + downstreamDebt.x * scale * .65 * strength,
    y: Math.max(diagonalFloor, outwardY) + downstreamDebt.y * scale * .65 * strength,
  };
}
