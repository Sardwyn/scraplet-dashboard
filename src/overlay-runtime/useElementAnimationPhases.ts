import { useEffect, useRef, useState } from "react";
import {
  OverlayAnimationPhase,
  OverlayElement,
} from "../shared/overlayTypes";

type ElementPhaseState = {
  phase: OverlayAnimationPhase;
};

export type ElementAnimationPhaseMap = Record<string, ElementPhaseState>;
export type ElementAnimationResetMap = Record<string, number>;

function isElementVisible(element: OverlayElement) {
  return element.visible !== false;
}

function hasAnimationConfig(element: OverlayElement) {
  if (element.type === "lower_third") return false;
  return !!element.animation;
}

function getAnimationTotalMs(element: OverlayElement) {
  const durationMs = Math.max(0, element.animation?.durationMs ?? 400);
  const delayMs = Math.max(0, element.animation?.delayMs ?? 0);
  return durationMs + delayMs;
}

function getStaticPhase(element: OverlayElement): OverlayAnimationPhase {
  return isElementVisible(element) ? "visible" : "hidden";
}

function buildInitialPhases(elements: OverlayElement[]): ElementAnimationPhaseMap {
  const next: ElementAnimationPhaseMap = {};
  for (const element of elements) {
    next[element.id] = { phase: getStaticPhase(element) };
  }
  return next;
}

export function useElementAnimationPhases(
  elements: OverlayElement[],
  resetMap?: ElementAnimationResetMap
) {
  const [phases, setPhases] = useState<ElementAnimationPhaseMap>(() =>
    buildInitialPhases(elements)
  );

  const previousVisibilityRef = useRef<Record<string, boolean>>({});
  const timerRef = useRef<Record<string, number>>({});
  const sequenceRef = useRef<Record<string, number>>({});
  const resetRef = useRef<ElementAnimationResetMap>({});

  useEffect(() => {
    for (const element of elements) {
      previousVisibilityRef.current[element.id] = isElementVisible(element);
      if (!sequenceRef.current[element.id]) {
        sequenceRef.current[element.id] = 0;
      }
    }
  }, []);

  useEffect(() => {
    const liveIds = new Set(elements.map((element) => element.id));

    setPhases((current) => {
      let next = current;

      for (const id of Object.keys(current)) {
        if (liveIds.has(id)) continue;

        if (next === current) next = { ...current };
        delete next[id];

        const timerId = timerRef.current[id];
        if (timerId) {
          window.clearTimeout(timerId);
          delete timerRef.current[id];
        }

        delete previousVisibilityRef.current[id];
        delete sequenceRef.current[id];
        delete resetRef.current[id];
      }

      for (const element of elements) {
        const id = element.id;
        const visible = isElementVisible(element);
        const priorVisible = previousVisibilityRef.current[id];
        const currentPhase = next[id]?.phase;
        const animated = hasAnimationConfig(element);
        const resetToken = resetMap?.[id] ?? 0;
        const priorResetToken = resetRef.current[id] ?? 0;

        if (resetToken !== priorResetToken) {
          const activeTimer = timerRef.current[id];
          if (activeTimer) {
            window.clearTimeout(activeTimer);
            delete timerRef.current[id];
          }

          if (next === current) next = { ...next };
          next[id] = { phase: getStaticPhase(element) };
          previousVisibilityRef.current[id] = visible;
          sequenceRef.current[id] = (sequenceRef.current[id] ?? 0) + 1;
          resetRef.current[id] = resetToken;
          continue;
        }

        if (priorVisible === undefined) {
          if (next === current) next = { ...next };
          next[id] = { phase: getStaticPhase(element) };
          previousVisibilityRef.current[id] = visible;
          resetRef.current[id] = resetToken;
          continue;
        }

        if (priorVisible === visible) {
          if (!animated) {
            const staticPhase = getStaticPhase(element);
            if (currentPhase !== staticPhase) {
              if (next === current) next = { ...next };
              next[id] = { phase: staticPhase };
            }
          }
          continue;
        }

        const activeTimer = timerRef.current[id];
        if (activeTimer) {
          window.clearTimeout(activeTimer);
          delete timerRef.current[id];
        }

        previousVisibilityRef.current[id] = visible;
        sequenceRef.current[id] = (sequenceRef.current[id] ?? 0) + 1;
        const sequence = sequenceRef.current[id];

        if (!animated) {
          if (next === current) next = { ...next };
          next[id] = { phase: visible ? "visible" : "hidden" };
          continue;
        }

        const transitionPhase: OverlayAnimationPhase = visible
          ? "entering"
          : "exiting";

        if (currentPhase !== transitionPhase) {
          if (next === current) next = { ...next };
          next[id] = { phase: transitionPhase };
        }

        const totalMs = getAnimationTotalMs(element);
        if (totalMs <= 0) {
          if (next === current) next = { ...next };
          next[id] = { phase: visible ? "visible" : "hidden" };
          continue;
        }

        timerRef.current[id] = window.setTimeout(() => {
          if (sequenceRef.current[id] !== sequence) return;

          setPhases((latest) => {
            const finalPhase: OverlayAnimationPhase = visible
              ? "visible"
              : "hidden";

            if (latest[id]?.phase === finalPhase) return latest;

            return {
              ...latest,
              [id]: { phase: finalPhase },
            };
          });

          delete timerRef.current[id];
        }, totalMs);
      }

      return next;
    });
  }, [elements, resetMap]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(timerRef.current)) {
        window.clearTimeout(timerId);
      }
      timerRef.current = {};
    };
  }, []);

  return phases;
}
