import type { Meta, StoryObj } from "storybook-solidjs";

import { DexieServiceProvider } from "@/services/dexie";
import { useDexieCloud } from "@/services/dexieCloud";

export default {
  title: "poc/dexie",
} satisfies Meta;

export const DexieCloudLoginTest: StoryObj = {
  render: () => {
    const { DexieCloudConfig, DexieCloudLogin } = useDexieCloud();

    return (
      <>
        <DexieCloudConfig />
        <DexieServiceProvider databaseName={"poc_dexie_DexieCloudLoginTest"}>
          <DexieCloudLogin fallback={"logging in"}>
            <p>logged in</p>
          </DexieCloudLogin>
        </DexieServiceProvider>
      </>
    );
  },
};
