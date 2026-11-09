import { useEffect, useRef, useState } from 'react';
import { anchorRect, popoverPosition } from './tourGeometry';

const PAD = 4;
const NARROW = 640;
const DIM = 'absolute bg-gray-900/60';

function useAnchorRect(target) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (target) document.querySelector(`[data-tour="${target}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const handleResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [target]);
  return anchorRect(target);
}

function Spotlight({ rect }) {
  if (!rect) return <div className={`${DIM} inset-0`} />;
  const top = Math.max(0, rect.top - PAD);
  const height = rect.height + 2 * PAD;
  const left = Math.max(0, rect.left - PAD);
  const width = rect.width + 2 * PAD;
  return (
    <>
      <div className={DIM} style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className={DIM} style={{ top: top + height, left: 0, right: 0, bottom: 0 }} />
      <div className={DIM} style={{ top, left: 0, width: left, height }} />
      <div className={DIM} style={{ top, left: left + width, right: 0, height }} />
      <div className="absolute border-2 border-[#B4A269]" style={{ top, left, width, height }} />
    </>
  );
}

function popoverStyle(rect, viewport) {
  if (viewport.width < NARROW) return { left: 0, right: 0, bottom: 0 };
  const pos = popoverPosition(rect, viewport);
  if (!pos) return { top: '50%', left: '50%', width: 360, transform: 'translate(-50%, -50%)' };
  return { top: pos.top, left: pos.left, width: pos.width, transform: pos.above ? 'translateY(-100%)' : undefined };
}

const BTN = 'px-3 py-1.5 text-[11px] font-medium border';

/**
 * The dimmed screen, the outline around the anchor and the step card.
 * Presentational: the step list and the saving live in OnboardingTour.
 * Keys: Escape skips, arrows move.
 *
 * @param {{ step: object, index: number, count: number, onBack: Function, onNext: Function, onSkip: Function, onCta: Function }} props
 * @returns {JSX.Element}
 * @example <TourOverlay step={step} index={0} count={5} onBack={back} onNext={next} onSkip={skip} onCta={open} />
 */
export default function TourOverlay({ step, index, count, onBack, onNext, onSkip, onCta }) {
  const rect = useAnchorRect(step.target);
  const nextRef = useRef(null);
  const isLast = index === count - 1;
  useEffect(() => { nextRef.current?.focus(); }, [step.id]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onSkip();
    if (e.key === 'ArrowRight') onNext();
    if (e.key === 'ArrowLeft' && index > 0) onBack();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[10000] outline-none print:hidden">
      <Spotlight rect={rect} />
      <div className="absolute bg-white border border-gray-200 p-4" style={popoverStyle(rect, { width: window.innerWidth, height: window.innerHeight })}>
        <div className="text-[10px] text-gray-400">{index + 1} of {count}</div>
        <h2 id="tour-title" className="mt-1 text-[12px] font-semibold text-gray-900">{step.title}</h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          {isLast ? <span /> : (
            <button type="button" onClick={onSkip} className="text-[11px] text-gray-500 hover:text-gray-800">Skip the tour</button>
          )}
          <div className="flex gap-2">
            {index > 0 && <button type="button" onClick={onBack} className={`${BTN} border-gray-300 text-gray-700 hover:bg-gray-50`}>Back</button>}
            {step.cta && (
              <button type="button" onClick={() => onCta(step.cta.path)} className={`${BTN} border-[#1A5632] text-[#1A5632] hover:bg-[#1A5632]/5`}>{step.cta.label}</button>
            )}
            <button ref={nextRef} type="button" onClick={onNext} className={`${BTN} border-[#1A5632] bg-[#1A5632] text-white hover:bg-[#14432a]`}>
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
