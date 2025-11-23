import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import appCss from '../styles.css?url';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'SMP Timeline',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  shellComponent: RootShell,
});

function RootShell({ children }: { children: React.ReactNode }) {
  // Get queryClient from router context
  const queryClient = Route.useRouteContext().queryClient;

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <script src="https://player.twitch.tv/js/embed/v1.js"></script>
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          <TanStackDevtools
            config={{
              position: 'bottom-left',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
