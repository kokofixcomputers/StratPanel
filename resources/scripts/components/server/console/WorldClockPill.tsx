import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { ServerContext } from '@/state/server';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { usePerformance } from '@/lib/performance';
import {
    clockOf,
    ClockSample,
    nextSample,
    projectDay,
    projectTime,
    Weather,
    weatherOf,
    WEATHER_LABELS,
} from '@/lib/worldClock';
import WeatherIcon from '@/components/server/console/WeatherIcon';
import styles from './style.module.css';

// The filter buttons are on the left and the other buttons on the right, the pill goes in the middle. Narrower than this there is
// no room for it, and the day only fits a little wider.
const MIN_WIDTH = 760;
const DAY_WIDTH = 880;
// The game minute is under a second long, this keeps the minutes from skipping.
const TICK_MS = 400;

/**
 * The time of the game and the weather at the top of the console, as a small pill like the ones of a weather app. It comes from
 * the Stratosphere helper, which tells the time and the weather with the TPS (protocol 8), and the panel moves the clock on
 * between two answers. Nothing is shown for a server that is off, or without the helper.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const performance = usePerformance(uuid);
    const world = performance?.world || null;
    const updatedAt = performance?.updatedAt || 0;

    const sample = useRef<ClockSample | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [width, setWidth] = useState(0);
    const anchor = useRef<HTMLSpanElement>(null);

    // Every answer sets the clock, and the speed the game runs at is learned from the answers.
    useEffect(() => {
        if (!world) {
            sample.current = null;
            return;
        }
        sample.current = nextSample(sample.current, world, updatedAt || Date.now());
        setNow(Date.now());
    }, [world?.time, world?.day, world?.raining, world?.thundering, updatedAt]);

    // The clock is moved on while somebody can see it.
    useEffect(() => {
        if (!world) return;

        const timer = setInterval(() => !document.hidden && setNow(Date.now()), TICK_MS);

        return () => clearInterval(timer);
    }, [!!world]);

    // The room between the buttons depends on the width of the console, not of the screen.
    useEffect(() => {
        const parent = anchor.current?.parentElement;
        if (!parent || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(() => setWidth(parent.clientWidth));
        observer.observe(parent);
        setWidth(parent.clientWidth);

        return () => observer.disconnect();
    }, []);

    const current = sample.current;
    if (status === 'offline' || status === 'stopping' || !world || !current)
        return <span ref={anchor} className={'hidden'} />;

    const time = projectTime(current, now);
    const day = projectDay(current, now);
    const weather: Weather = weatherOf({ time: time % 24000, raining: world.raining, thundering: world.thundering });
    const clock = clockOf(time);
    const description = `${WEATHER_LABELS[weather]}, ${clock.label}, day ${day}`;

    return (
        <>
            <span ref={anchor} className={'hidden'} />
            {width >= MIN_WIDTH && (
                <Tooltip content={description} placement={'bottom'} delay={150}>
                    <div className={classNames(styles.world_pill)} role={'status'} aria-label={description}>
                        <WeatherIcon weather={weather} />
                        <span className={'tabular-nums'}>{clock.label}</span>
                        {width >= DAY_WIDTH && <span className={styles.world_day}>Day {day}</span>}
                    </div>
                </Tooltip>
            )}
        </>
    );
};
