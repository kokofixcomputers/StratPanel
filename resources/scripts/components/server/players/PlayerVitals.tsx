import React from 'react';
import classNames from 'classnames';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import styles from '@/components/server/players/PlayerVitals.module.css';
import { FOOD_EMPTY, FOOD_FULL, FOOD_HALF, HEART_CONTAINER, HEART_FULL, HEART_HALF } from '@/lib/hudIcons';
import { exactNumber } from '@/lib/statFormat';
import { foodIcons, heartIcons, saturatedIcons, Vitals } from '@/lib/vitals';

const HEARTS = { full: HEART_FULL, half: HEART_HALF, empty: null } as const;
const FOOD = { full: FOOD_FULL, half: FOOD_HALF, empty: null } as const;

// In the game every icon is 9 pixels wide and 8 apart, rows are 10 apart, and the hunger bar starts 101 pixels in.
const STEP = 8;
const ROW = 10;
const PER_ROW = 10;
const FOOD_LEFT = 101;

const px = (units: number) => `calc(${units}px * var(--s))`;

/** The health and hunger bars of a player as the game draws them, hearts on the left and hunger on the right. */
export default ({ vitals, className }: { vitals: Vitals; className?: string }) => {
    const hearts = heartIcons(vitals.health, vitals.maxHealth);
    const rows = Math.ceil(hearts.length / PER_ROW);
    const food = foodIcons(vitals.food);
    const glowing = saturatedIcons(vitals.saturation);

    return (
        <Tooltip
            arrow
            placement={'top'}
            content={
                <div className={'space-y-0.5'}>
                    <div>
                        Health {exactNumber(vitals.health, 2)} / {exactNumber(vitals.maxHealth, 0)}
                        {vitals.absorption > 0 && ` + ${exactNumber(vitals.absorption, 2)} absorption`}
                    </div>
                    <div className={'font-normal text-slate-300'}>
                        Hunger {vitals.food} / 20, saturation {exactNumber(vitals.saturation, 2)}
                    </div>
                    <div className={'font-normal text-slate-300'}>Level {vitals.level}</div>
                </div>
            }
        >
            <div
                className={classNames(styles.hud, className)}
                style={{ height: px(9 + (rows - 1) * ROW) }}
                aria-label={`Health ${vitals.health} of ${vitals.maxHealth}, hunger ${vitals.food} of 20`}
                role={'img'}
            >
                {hearts.map((icon, index) => {
                    const left = px((index % PER_ROW) * STEP);
                    // The first row is the bottom one, more hearts stack above it.
                    const top = px((rows - 1 - Math.floor(index / PER_ROW)) * ROW);

                    return (
                        <React.Fragment key={index}>
                            <img className={styles.icon} src={HEART_CONTAINER} alt={''} style={{ left, top }} />
                            {HEARTS[icon] && (
                                <img className={styles.icon} src={HEARTS[icon]!} alt={''} style={{ left, top }} />
                            )}
                        </React.Fragment>
                    );
                })}
                {food.map((icon, index) => {
                    // The first icon is the rightmost one.
                    const left = px(FOOD_LEFT + (9 - index) * STEP);
                    const top = px((rows - 1) * ROW);

                    return (
                        <React.Fragment key={index}>
                            <img className={styles.icon} src={FOOD_EMPTY} alt={''} style={{ left, top }} />
                            {FOOD[icon] && (
                                <img
                                    className={styles.icon}
                                    src={FOOD[icon]!}
                                    alt={''}
                                    // Saturation is not drawn by the game. A gold glow marks the drumsticks it is covering.
                                    style={{
                                        left,
                                        top,
                                        filter:
                                            index < glowing
                                                ? 'drop-shadow(0 0 calc(1px * var(--s)) #ffc83d)'
                                                : undefined,
                                    }}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </Tooltip>
    );
};
