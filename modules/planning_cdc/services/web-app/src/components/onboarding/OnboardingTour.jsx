import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import usePermissionStore from '@/stores/usePermissionStore';
import { useTourStore } from '@/stores/useTourStore';
import { TOUR_OUTCOMES } from '@rbm/lib/enums';
import { FULL_TOUR, TOUR_VERSION, tourFor } from '@/config/onboardingTour';
import { useTourSeen, useSaveTourSeen } from './useTourQueries';
import { anchorRect } from './tourGeometry';
import TourOverlay from './TourOverlay';

// The tour starts by itself only on a home page, never on a deep link
// (an approval opened from an email must not be covered by a tour).
const HOME_PATHS = ['/dashboard', '/report'];

const visibleSteps = (steps) => steps.filter((s) => !s.target || anchorRect(s.target));

function useAutoStart(seen) {
  const { pathname } = useLocation();
  const isPermissionsLoaded = usePermissionStore((s) => !!s.loadedAt);
  const { autoChecked, markAutoChecked, start } = useTourStore();
  useEffect(() => {
    if (autoChecked || !seen.isSuccess || !isPermissionsLoaded || !HOME_PATHS.includes(pathname)) return;
    markAutoChecked();
    const { mode } = tourFor(seen.data);
    if (mode) start(mode);
  }, [autoChecked, seen.isSuccess, seen.data, isPermissionsLoaded, pathname, markAutoChecked, start]);
}

/**
 * In-app onboarding tour (D-20261105-16): the full tour at first sign-in,
 * the « What's new » steps after a release, the full tour again from the
 * menu under the initials. Steps whose anchor is not on screen for this
 * user (another role's menu, a phone) are left out. Finishing or skipping
 * records TOUR_VERSION for the user.
 *
 * @returns {JSX.Element|null}
 * @example <OnboardingTour />
 */
export default function OnboardingTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const seen = useTourSeen(!!user);
  const save = useSaveTourSeen();
  const { mode, index, go, stop } = useTourStore();
  useAutoStart(seen);

  // Read when the tour opens: the menu of the user's role is on screen by then.
  const steps = useMemo(
    () => (mode ? visibleSteps(mode === 'full' ? FULL_TOUR : tourFor(seen.data).steps) : []),
    [mode, seen.data],
  );

  const handleFinish = (outcome) => {
    save.mutate({ version: TOUR_VERSION, outcome });
    stop();
  };

  useEffect(() => {
    if (mode && !steps.length) handleFinish(TOUR_OUTCOMES.FINISHED);
  });

  if (!mode || !steps.length) return null;
  const step = steps[Math.min(index, steps.length - 1)];
  return (
    <TourOverlay
      step={step}
      index={index}
      count={steps.length}
      onBack={() => go(Math.max(0, index - 1))}
      onNext={() => (index + 1 < steps.length ? go(index + 1) : handleFinish(TOUR_OUTCOMES.FINISHED))}
      onSkip={() => handleFinish(TOUR_OUTCOMES.SKIPPED)}
      onCta={(path) => { handleFinish(TOUR_OUTCOMES.FINISHED); navigate(path); }}
    />
  );
}
