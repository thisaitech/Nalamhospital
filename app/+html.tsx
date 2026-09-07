import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

import { MOBILE_WEB_MAX_WIDTH } from '@/constants/mobileWeb';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: mobileWebStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const mobileWebStyles = `
html,
body {
  height: 100%;
  min-height: 100dvh;
  margin: 0;
  padding: 0;
}

body {
  overflow: auto !important;
  background-color: #dbe4f0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

#root {
  width: 100%;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

@media (min-width: ${MOBILE_WEB_MAX_WIDTH + 1}px) {
  body {
    display: flex;
    justify-content: center;
    background-color: #dbe4f0;
  }

  #root {
    max-width: ${MOBILE_WEB_MAX_WIDTH}px;
    box-shadow: 0 10px 40px rgba(15, 23, 42, 0.14);
  }
}

@media (prefers-color-scheme: dark) {
  body {
    background-color: #0f172a;
  }
}
`;
