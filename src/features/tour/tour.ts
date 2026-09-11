/**
 * Guided tour on top of driver.js. Steps target real elements by
 * data-tour attributes; a step may navigate to another route first.
 */
import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export interface TourStep {
  /** data-tour value of the element to spotlight; omit for a centred message */
  target?: string;
  route?: string;
  title: string;
  body: string;
}

export interface TourOptions {
  navigate: (route: string) => void;
  onDone?: () => void;
  labels?: { next: string; prev: string; done: string; progress: string };
}

let active: Driver | null = null;

function waitFor(selector: string, timeout = 2500): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const check = () => {
      if (document.querySelector(selector) || performance.now() - t0 > timeout) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}

export function startTour(steps: TourStep[], opts: TourOptions) {
  if (active) {
    active.destroy();
    active = null;
  }
  const labels = opts.labels ?? { next: 'Next', prev: 'Back', done: 'Done', progress: '{{current}} of {{total}}' };
  const driveSteps: DriveStep[] = steps.map((s) => ({
    element: s.target ? `[data-tour="${s.target}"]` : undefined,
    popover: { title: s.title, description: s.body, side: 'bottom', align: 'start' },
  }));

  const d = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    allowClose: true,
    popoverClass: 'samanvay-tour',
    nextBtnText: labels.next,
    prevBtnText: labels.prev,
    doneBtnText: labels.done,
    progressText: labels.progress,
    steps: driveSteps,
    onNextClick: async (_el, _step, { state }) => {
      const idx = (state.activeIndex ?? 0) + 1;
      const next = steps[idx];
      if (!next) {
        d.destroy();
        return;
      }
      if (next.route && window.location.pathname !== next.route) {
        opts.navigate(next.route);
        if (next.target) await waitFor(`[data-tour="${next.target}"]`);
        else await new Promise((r) => setTimeout(r, 120));
      }
      d.moveNext();
    },
    onPrevClick: async (_el, _step, { state }) => {
      const idx = (state.activeIndex ?? 0) - 1;
      const prev = steps[idx];
      if (prev?.route && window.location.pathname !== prev.route) {
        opts.navigate(prev.route);
        if (prev.target) await waitFor(`[data-tour="${prev.target}"]`);
      }
      d.movePrevious();
    },
    onDestroyed: () => {
      active = null;
      opts.onDone?.();
    },
  });
  active = d;
  const first = steps[0];
  const go = async () => {
    if (first?.route && window.location.pathname !== first.route) {
      opts.navigate(first.route);
      if (first.target) await waitFor(`[data-tour="${first.target}"]`);
    }
    d.drive(0);
  };
  void go();
  return d;
}

export function stopTour() {
  if (active) {
    active.destroy();
    active = null;
  }
}
