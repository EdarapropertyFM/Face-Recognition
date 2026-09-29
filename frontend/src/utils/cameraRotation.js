/**
 * Quarter turns for a camera that is mounted on its side.
 *
 * The angle itself lives on the camera record, and the AI applies it to the
 * frames before recognition runs. Rotating in the browser instead would fix
 * only the appearance: the pipeline would still be looking at faces lying on
 * their side, where a detector is far weaker, and the overlay the AI draws
 * would be turned along with the picture.
 */
export const ANGLES = [0, 90, 180, 270];

/** The next quarter turn, wrapping back to upright. */
export function nextAngle(angle) {
  const at = ANGLES.indexOf(Number(angle));
  return ANGLES[(at < 0 ? 0 : at + 1) % ANGLES.length];
}
