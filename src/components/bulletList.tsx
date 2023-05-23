import type { JSX } from "solid-js";

import { styles } from "@/styles.css";

export function BulletList(props: { bullet: JSX.Element; item: JSX.Element; child: JSX.Element; isSelected: boolean }) {
  return (
    <div class={styles.bulletList.container}>
      <div class={styles.bulletList.bullet}>{props.bullet}</div>
      <div classList={{ [styles.bulletList.item]: true, [styles.selected]: props.isSelected }}>{props.item}</div>
      <div class={styles.bulletList.child}>{props.child}</div>
    </div>
  );
}
