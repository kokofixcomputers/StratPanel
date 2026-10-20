import React from 'react';
import { Route } from 'react-router-dom';
import LoginContainer from '@/components/auth/LoginContainer';

/** The real sign in page for the frame of the theme editor, which is signed in (the real address sends such people away). Inert. */
export default () => (
    <div style={{ pointerEvents: 'none' }}>
        <Route component={LoginContainer} />
    </div>
);
