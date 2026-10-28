import React from 'react';

interface RobotIconProps {
  size?: number;
  className?: string;
  variant?: 'white' | 'blue';
}

export const RobotIcon: React.FC<RobotIconProps> = ({
  size = 24,
  className = '',
  variant = 'white'
}) => {
  const headColor = variant === 'blue' ? '#0284c7' : '#ffffff';
  const faceColor = variant === 'blue' ? '#ffffff' : '#0284c7';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Top Antenna */}
      <circle cx="16" cy="3.5" r="1.5" fill={headColor} />
      <path d="M16 5V8" stroke={headColor} strokeWidth="1.8" strokeLinecap="round" />

      {/* Left & Right Ears */}
      <rect x="2.5" y="13" width="2" height="5" rx="1" fill={headColor} />
      <rect x="27.5" y="13" width="2" height="5" rx="1" fill={headColor} />

      {/* Main Head Speech Bubble */}
      <path
        d="M11.5 8H20.5C24.6421 8 28 11.3579 28 15.5C28 19.6421 24.6421 23 20.5 23H12L7.8 26.5C7.26 26.95 6.5 26.55 6.5 25.85V21.8C4.95 20.25 4 18 4 15.5C4 11.3579 7.35786 8 11.5 8Z"
        fill={headColor}
      />

      {/* Left Eye */}
      <circle cx="12" cy="15" r="1.75" fill={faceColor} />

      {/* Right Eye */}
      <circle cx="20" cy="15" r="1.75" fill={faceColor} />

      {/* Curved Smile */}
      <path
        d="M13.5 18C14.3 19.5 17.7 19.5 18.5 18"
        stroke={faceColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
};
