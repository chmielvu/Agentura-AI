
import React from 'react';
import { PolishEagleIcon } from '../../components/PolishEagleIcon';

export const AestheticPanel: React.FC = () => {
    return (
        <aside className="w-[140px] flex-shrink-0 bg-card/40 border-r border-border flex flex-col items-center pt-10 backdrop-blur-sm hidden md:flex">
            <div className="sticky top-10 flex flex-col items-center gap-4">
                <PolishEagleIcon className="w-28 h-28" />
                <div className="w-px h-32 bg-gradient-to-b from-accent/50 to-transparent" />
            </div>
        </aside>
    );
};
