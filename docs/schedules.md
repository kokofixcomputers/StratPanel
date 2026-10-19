# Schedules

The schedule window explains the five cron fields as you type: "Runs every 5 minutes.", "Runs at 04:00 on weekdays.", and the next three times it runs, by the
clock of the panel (`APP_TIMEZONE`, handed to the page as `timezone`). Wrong values are explained ("Minute must be between 0 and 59.") and the save button waits.
Presets fill the fields with a click. Only plain cron is read (numbers, lists, ranges, steps, JAN-DEC, SUN-SAT; 0 and 7 are Sunday); `L`, `W`, `#` are left
unexplained and the panel checks them on save. When both the day of the month and the day of the week are set, either one is enough, like cron does.

The windows of the panel no longer run off the bottom of the screen: the space above a window is a share of the height (never of the width), and a window that is taller
than the screen scrolls inside itself. Code: `lib/cron.ts`, `components/server/schedules/`, `components/elements/Modal.tsx`.
