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
  selected: style({
    backgroundColor: nord[1],
  }),

  editor: style({
    width: "100%",

    color: nord[5],
    backgroundColor: "transparent",

    boxSizing: "border-box",
    padding: 0,
    border: "none",
    outline: "none",

    fontFamily: "sans-serif",
    fontSize: "inherit",
  }),

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

  actionLogList: {
    container: style({
      display: "grid",
      gridTemplateColumns: "auto",
      gridRowGap: "0.5ch",
    }),
    separator: style({
      gridColumn: "1 / -1",
    }),
    actionLog: {
      container: style({
        display: "grid",
        gridColumn: "1 / -1",
        gridTemplateColumns: "18ch 18ch max-content auto",
        gridTemplateRows: "1.5em 1.5em",
        gridColumnGap: "0.5ch",

        boxSizing: "border-box",
        marginLeft: "0.4ch",
      }),
      startAt: style({
        gridColumnStart: 1,
      }),
      endAt: style({
        gridColumnStart: 2,
      }),
      duration: style({
        gridColumnStart: 3,
      }),
      text: style({
        gridRowStart: 2,
        gridColumn: "1 / -1",
      }),
    },
  },
};

globalStyle("body", {
  fontFamily: "sans-serif",
  color: nord[5],
  backgroundColor: nord[0],
});
