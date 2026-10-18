import React from 'react';
import { DesktopComputerIcon, MoonIcon, SunIcon } from '@heroicons/react/outline';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { ThemeChoice, useTheme } from '@/lib/theme';

// The order a click goes through: follow the device, then light, then dark.
const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const NAME: Record<ThemeChoice, string> = { system: 'the device', light: 'light', dark: 'dark' };

/** A button that changes the theme of the panel: it follows the device, or is light, or is dark. For the bar at the top. */
export default () => {
    const { choice, theme, setChoice } = useTheme();
    const label =
        choice === 'system'
            ? `Theme: follows your device (${theme} now). Click for light.`
            : `Theme: ${choice}. Click for ${
                  NAME[NEXT[choice]] === 'the device' ? 'your device' : NAME[NEXT[choice]]
              }.`;

    return (
        <Tooltip placement={'bottom'} content={label}>
            <button type={'button'} aria-label={label} onClick={() => setChoice(NEXT[choice])}>
                {choice === 'system' ? <DesktopComputerIcon /> : choice === 'light' ? <SunIcon /> : <MoonIcon />}
            </button>
        </Tooltip>
    );
};
