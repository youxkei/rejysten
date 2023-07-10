import type { Meta, StoryObj } from "storybook-solidjs";

import { PrimitiveForTest, PrimitiveIndexTest } from "@/components/poc/for";

export default {
  title: "poc/for",
} satisfies Meta;

export const For: StoryObj = {
  render: () => <PrimitiveForTest />,
};

export const Index: StoryObj = {
  render: () => <PrimitiveIndexTest />,
};
