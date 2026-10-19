import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge doesn't know about c3 typography utilities (text-c3-bold-label-l2 etc.),
 * so by default it strips them when they appear alongside other text-* classes
 * (e.g. text-[color:var(...)]). Register the c3-* font-size prefix here so merge
 * understands `text-c3-...` belongs to the font-size group, separate from text-color.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: [(classPart: string) => classPart.startsWith("c3-")] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
