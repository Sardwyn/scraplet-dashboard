import React from 'react';
import { PerformanceModeProvider } from '../shared/overlayRenderer/PerformanceModeContext';
import { OverlayEditorApp } from './OverlayEditorApp';

// Wrapper component that provides performance mode context
// The toggle button is now integrated into the OverlayEditorApp toolbar
export default function OverlayEditorWithPerformanceMode(props: any) {
  return (
    <PerformanceModeProvider>
      <OverlayEditorApp {...props} />
    </PerformanceModeProvider>
  );
}
