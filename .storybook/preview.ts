import type { Preview } from "@kachurun/storybook-solid-vite";

export default {
  tags: ["!autodocs"],
  parameters: {
    // automatically create action args for all props that start with "on"
    actions: { argTypesRegex: "^on.*" },
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
