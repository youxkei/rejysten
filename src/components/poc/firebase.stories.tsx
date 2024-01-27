import type { Meta, StoryObj } from "storybook-solidjs";

import { getDocs } from "firebase/firestore";
import { For, createResource, createSignal } from "solid-js";

import { FirebaseServiceProvoider, getCollection, useFirebaseService } from "@/services/firebase";

export default {
  title: "poc/firebase",
} satisfies Meta;

export const FirestoreTest: StoryObj = {
  render() {
    const [configYAML$, setConfigYAML] = createSignal("");
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <input
          type="text"
          value={configYAML$()}
          onInput={(e) => {
            setErrors([]);
            setConfigYAML(e.currentTarget.value);
          }}
        />

        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={configYAML$()} setErrors={setErrors}>
          {(() => {
            const firebase = useFirebaseService();
            const itemCollection = getCollection(firebase, "firestoretest");

            const [items$] = createResource(() => getDocs(itemCollection));

            return (
              <>
                <p>items:</p>
                <For each={items$()?.docs}>
                  {(item) => (
                    <p>
                      {item.id}: {item.data().text}
                    </p>
                  )}
                </For>
              </>
            );
          })()}
        </FirebaseServiceProvoider>
      </>
    );
  },
};
