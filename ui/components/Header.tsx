import React from 'react';
import { Persona } from '../../types';
import { RouterIcon } from '../../components/Icons';
import { APP_TITLE } from '../../constants';

export const Header: React.FC<{
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
}> = ({ persona, onPersonaChange }) => (
  <header className="bg-card p-4 border-b border-border fixed top-0 left-0 right-0 z-20">
    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="flex items-center space-x-3">
        <RouterIcon className="h-8 w-8 text-accent" />
        <h1 className="text-xl font-bold text-foreground font-sans">{APP_TITLE}</h1>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <div className="flex items-center bg-background rounded-sm p-1 border border-border">
          <span className="text-xs text-foreground/70 px-2">MoE Persona:</span>
          {Object.values(Persona).map((p) => (
            <button
              key={p}
              onClick={() => onPersonaChange(p)}
              className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors duration-200 ${
                persona === p ? 'bg-accent/80 text-white' : 'text-foreground/80 hover:bg-card'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  </header>
);
