import type { StorybookConfig } from "storybook-solidjs-vite";

export default {
  framework: "storybook-solidjs-vite",
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [],
  docs: {
    autodocs: false,
  },
  viteFinal: (config) => {
    config.server = config.server || {};
    config.server.allowedHosts = true;
    return config;
  },
} as StorybookConfig;
