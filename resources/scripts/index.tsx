import React from 'react';
import ReactDOM from 'react-dom';
import App from '@/components/App';
import { setConfig } from 'react-hot-loader';
import { startTheme } from '@/lib/theme';

// The colours of the light and the dark theme, as CSS variables.
import '@/assets/css/theme.css';

// Enable language support.
import './i18n';

// Prevents page reloads while making component changes which
// also avoids triggering constant loading indicators all over
// the place in development.
//
// @see https://github.com/gaearon/react-hot-loader#hook-support
setConfig({ reloadHooks: false });

// Shows the theme that was chosen (the page already set it before it was drawn) and follows the device.
startTheme();

ReactDOM.render(<App />, document.getElementById('app'));
