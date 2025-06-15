import type { StorybookConfig } from "@kachurun/storybook-solid-vite";

export default {
  framework: "@kachurun/storybook-solid-vite",
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [],
  docs: {
    autodocs: false,
  },
} as StorybookConfig;
