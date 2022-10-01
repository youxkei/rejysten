import type { ReactNode } from "react";
import { styles } from "@/styles.css";

export function BulletList(props: {
  bullet: ReactNode;
  item: ReactNode;
  child: ReactNode;
}) {
  return (
    <div className={styles.bulletList.container}>
      <div className={styles.bulletList.bullet}>{props.bullet}</div>
      <div className={styles.bulletList.item}>{props.item}</div>
      <div className={styles.bulletList.child}>{props.child}</div>
    </div>
  );
}
