import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

/** Starts the planning engine once, keeps <html> in sync with theme & language. */
export function EngineBoot() {
  const runPlan = useAppStore((s) => s.runPlan);
  const status = useAppStore((s) => s.planStatus);
  const theme = useAppStore((s) => s.theme);
  const lang = useAppStore((s) => s.language);

  useEffect(() => {
    if (status === 'idle') void runPlan({ reason: 'initial load' });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
