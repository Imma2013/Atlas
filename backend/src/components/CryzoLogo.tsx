'use client';

type CryzoLogoProps = {
  compact?: boolean;
  className?: string;
};

const CryzoLogo = ({ compact = false, className = '' }: CryzoLogoProps) => {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <svg
        width={compact ? 24 : 28}
        height={compact ? 24 : 28}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cryzo-grad" x1="3" y1="3" x2="25" y2="25" gradientUnits="userSpaceOnUse">
            <stop stopColor="#14B8A6" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="24" height="24" rx="8" fill="url(#cryzo-grad)" />
        <path
          d="M19.7 9.3C18.1 7.8 16.2 7 14 7C9.58 7 6 10.58 6 15C6 19.42 9.58 23 14 23C16.2 23 18.1 22.2 19.7 20.7L18.2 18.9C17.1 19.9 15.7 20.5 14 20.5C10.96 20.5 8.5 18.04 8.5 15C8.5 11.96 10.96 9.5 14 9.5C15.7 9.5 17.1 10.1 18.2 11.1L19.7 9.3Z"
          fill="white"
        />
      </svg>
      {!compact ? (
        <span className="text-[1.02rem] font-semibold tracking-tight text-black dark:text-white">Cryzo</span>
      ) : null}
    </div>
  );
};

export default CryzoLogo;
