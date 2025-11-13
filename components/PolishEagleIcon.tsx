
import React from 'react';

/**
 * A stylized, uncrowned eagle emblem, designed to fit the stark, utilitarian aesthetic of the application,
 * while being reminiscent of Polish iconography.
 */
export const PolishEagleIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.88 4.24a1 1 0 0 0-1.13.25L13 9.49V5a1 1 0 1 0-2 0v4.49L6.25 4.49a1 1 0 1 0-1.42 1.42L9.59 10.5 5.13 14a1 1 0 1 0 1.53 1.28L11 11.5v3.78l-3.32 2.65a1 1 0 1 0 1.25 1.56L12 17.22l3.07 2.29a1 1 0 1 0 1.25-1.56L13 15.28v-3.78l4.34 3.78a1 1 0 0 0 1.53-1.28L14.41 10.5l4.74-4.59a1 1 0 0 0-.27-1.67Z"/>
  </svg>
);
