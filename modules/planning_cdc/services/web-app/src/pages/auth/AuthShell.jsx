import { withBase } from '@/utils/basePath';

/**
 * Shared chrome of the public sign-in pages (/login and the Microsoft
 * callback): the green panel with the platform name on the left (desktop
 * only), the Africa CDC logo and the page content on the right. On a phone
 * the platform name sits under the logo.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 * @example <AuthShell><h2>Sign in</h2></AuthShell>
 */
export default function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[480px] flex-col p-10 relative overflow-hidden bg-[#1A5632]">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom right, #1A5632, #14472A, #0F3820)' }}
        />
        <div
          className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(52, 143, 65, 0.08)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-[200px] h-[200px] rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(180, 162, 105, 0.08)' }}
        />

        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h1 className="text-white text-[32px] font-bold leading-[1.15] tracking-tight">
            Results-Based<br />Management<br />Platform
          </h1>
          <p className="text-white/80 text-[14px] mt-4 leading-relaxed max-w-[320px]">
            Plan, execute, monitor and report across all programs with full traceability.
          </p>
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center px-6 py-10 bg-white">
        <div className="w-full max-w-[360px]">
          <div className="mb-8">
            <img src={withBase('/africa-cdc-logo-trimmed.png')} alt="Africa CDC" className="h-[60px] w-auto" />
            <p className="lg:hidden mt-2 text-[13px] font-semibold text-[#1A5632]">
              Results-Based Management Platform
            </p>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
