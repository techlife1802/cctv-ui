import React from 'react';

interface LogoProps {
    className?: string;
    width?: number;
    height?: number;
}

const Logo: React.FC<LogoProps> = ({ className, width = 64, height = 64 }) => {
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <defs>
                <linearGradient id="logoGradient" x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#2563eb" />
                    <stop offset="1" stopColor="#1d4ed8" />
                </linearGradient>
            </defs>
            {/* Shield Outline */}
            <path
                d="M32 4L6 14V30C6 45.5 17.2 59.8 32 63.5C46.8 59.8 58 45.5 58 30V14L32 4Z"
                fill="url(#logoGradient)"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            {/* Inner Eye Design */}
            <path
                d="M32 18C23 18 15.5 24 13 32C15.5 40 23 46 32 46C41 46 48.5 40 51 32C48.5 24 41 18 32 18ZM32 40C27.58 40 24 36.42 24 32C24 27.58 27.58 24 32 24C36.42 24 40 27.58 40 32C40 36.42 36.42 40 32 40ZM32 28C29.8 28 28 29.8 28 32C28 34.2 29.8 36 32 36C34.2 36 36 34.2 36 32C36 29.8 34.2 28 32 28Z"
                fill="white"
                opacity="0.9"
            />
        </svg>
    );
};

export default Logo;
