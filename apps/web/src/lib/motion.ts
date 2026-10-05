/**
 * Something that opens up in a column (an error line, a panel) fades and slides in rather than
 * growing taller. Whatever sits below it glides out of the way: give those rows `layout="position"`.
 * Put it in `<AnimatePresence mode="popLayout">`, so a leaving one steps out of the flow at once and
 * the rows after it glide up while it fades.
 */
export const SLIDE_IN = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
} as const;
