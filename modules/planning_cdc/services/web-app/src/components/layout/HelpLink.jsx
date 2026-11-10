import { useLocation } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { helpFor } from '@/config/pageHelp';

const STYLES = Object.freeze({
  bar: 'ml-auto flex items-center gap-1.5 h-full px-4 text-[12px] font-medium text-white/75 hover:text-white hover:bg-white/[0.05] flex-shrink-0',
  menu: 'flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-[#1A5632] border-b border-gray-200 hover:bg-[#F5F7FA]',
});

/**
 * « Help » link to the chapter of the user's guide that explains the current
 * page (D-20261106-04), in a new tab. Renders nothing on a page no chapter
 * covers.
 *
 * @param {{ variant?: 'bar'|'menu', onNavigate?: () => void }} props - bar = main menu bar, menu = phone menu
 * @returns {JSX.Element|null}
 * @example <HelpLink variant="bar" />
 */
export default function HelpLink({ variant = 'bar', onNavigate }) {
  const { pathname } = useLocation();
  const auth = useAuth(); // null outside the provider (isolated layout tests)
  const help = helpFor(pathname, auth?.user?.roles || []);
  if (!help) return null;
  return (
    <a href={help.url} target="_blank" rel="noopener noreferrer" onClick={onNavigate}
      title={`${help.title}, chapter ${help.chapter}`} data-tour={variant === 'bar' ? 'help' : undefined} className={STYLES[variant]}>
      <CircleHelp className="w-3.5 h-3.5" />
      <span>{variant === 'bar' ? 'Help' : 'Help on this page'}</span>
    </a>
  );
}
