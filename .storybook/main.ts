import type { StorybookConfig } from "storybook-solidjs-vite";

export default {
  framework: "storybook-solidjs-vite",
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [],
  docs: {
    autodocs: false,
  },
} as StorybookConfig;
