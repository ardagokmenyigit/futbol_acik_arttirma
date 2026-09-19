import { useEffect, useState } from 'react';

const INTRO_PLAY_MS = 1960;
const INTRO_EXIT_MS = 560;

export function LogoIntro() {
  const [isEnding, setIsEnding] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setIsEnding(true), INTRO_PLAY_MS);
    const removeTimer = window.setTimeout(() => setIsVisible(false), INTRO_PLAY_MS + INTRO_EXIT_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className={`logo-intro${isEnding ? ' ending' : ''}`} aria-hidden="true">
      <img className="logo-intro-image" src="/auction-logo-intro.gif" alt="" />
    </div>
  );
}
