import React from 'react';

/**
 * Renders the modern, post-1990 Polish Eagle with the crown.
 * This version is specifically for the 'WSI' themes.
 */
export const PolishEagleIconModern: React.FC<{ className?: string }> = ({ className = "w-24 h-24" }) => (
  <div className={`${className} flex items-center justify-center overflow-hidden`}>
    <img 
      src="https://upload.wikimedia.org/wikipedia/commons/c/c9/God%C5%82o_Polski.svg" 
      alt="Godło Polski"
      className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg"
    />
  </div>
);
