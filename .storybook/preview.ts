import type { Preview } from "storybook-solidjs-vite";

export default {
  tags: ["!autodocs"],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      codePanel: true,
    },
  },
} as Preview;
