import type { JSX } from "solid-js";

import { styles } from "@/styles.css";

export function BulletList(props: { bullet: JSX.Element; item: JSX.Element; child: JSX.Element }) {
  return (
    <div class={styles.bulletList.container}>
      <div class={styles.bulletList.bullet}>{props.bullet}</div>
      <div class={styles.bulletList.item}>{props.item}</div>
      <div class={styles.bulletList.child}>{props.child}</div>
    </div>
  );
}
