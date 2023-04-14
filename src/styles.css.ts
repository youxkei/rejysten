import { style } from "@vanilla-extract/css";

const bulletListItemMinHeight = 27;

export const styles = {
  bulletList: {
    container: style({
      display: "grid",
      gridTemplateColumns: "32px 8px auto",
      gridTemplateRows: "auto auto",
      width: "100%",
    }),

    bullet: style({
      gridColumnStart: 1,
      minHeight: bulletListItemMinHeight,
      display: "flex",
      alignItems: "center",
      justifyContent: "end",
    }),

    item: style({
      gridColumnStart: 3,
      minHeight: bulletListItemMinHeight,
      display: "flex",
      alignItems: "center",
    }),

    child: style({
      gridColumnStart: 3,
      gridRowStart: 2,
      width: "100%",
    }),
  },
};
