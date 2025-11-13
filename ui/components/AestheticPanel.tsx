
import React from 'react';
import { PolishEagleIcon } from '../../components/PolishEagleIcon';

export const AestheticPanel: React.FC = () => {
    return (
        <div className="h-[160px] flex-shrink-0 bg-card border-b border-border grid place-items-center">
            <PolishEagleIcon className="w-28 h-28 transition-transform duration-300 ease-in-out hover:scale-105" />
        </div>
    );
};
