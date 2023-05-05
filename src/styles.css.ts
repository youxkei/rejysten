import { style, globalStyle } from "@vanilla-extract/css";

// from https://www.nordtheme.com/docs/colors-and-palettes
const nord = [
  "#2E3440",
  "#3B4252",
  "#434C5E",
  "#4C566A",
  "#D8DEE9",
  "#E5E9F0",
  "#ECEFF4",
  "#8FBCBB",
  "#88C0D0",
  "#81A1C1",
  "#5E81AC",
  "#BF616A",
  "#D08770",
  "#EBCB8B",
  "#A3BE8C",
  "#B48EAD",
];

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

    selected: style({
      backgroundColor: nord[1],
    }),
  },
};

globalStyle("body", {
  color: nord[5],
  backgroundColor: nord[0],
});
