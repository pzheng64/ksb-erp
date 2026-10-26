"use client";

import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query. Returns `undefined` until mounted so callers can
 * avoid acting on a guess during server rendering.
 */
export function useMediaQuery(query: string): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Matches Tailwind's `xl` breakpoint. */
export const WIDE_SCREEN = "(min-width: 1280px)";
