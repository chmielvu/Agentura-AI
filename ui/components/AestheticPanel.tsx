
import React from 'react';
import { PolishEagleIcon } from '../../components/PolishEagleIcon';
import { PolishEagleIconModern } from '../../components/PolishEagleIconModern';
import { useAppContext } from '../context/AppProvider';

export const AestheticPanel: React.FC = () => {
    const { theme } = useAppContext();
    const isSBTheme = theme === 'sb';

    return (
        <div className="h-[160px] flex-shrink-0 bg-card border-b border-border grid place-items-center group">
            {isSBTheme ? (
                <PolishEagleIcon className="w-28 h-28 transition-transform duration-300 ease-in-out group-hover:scale-105" />
            ) : (
                <PolishEagleIconModern className="w-28 h-28 transition-transform duration-300 ease-in-out group-hover:scale-105" />
            )}
        </div>
    );
};