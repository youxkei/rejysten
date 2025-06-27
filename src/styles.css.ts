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

export const styles = {
  lifeLogs: {
    container: style({
      height: "100%",
      overflow: "auto",
      padding: "1rem",
    }),
    list: style({
      listStyle: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
    }),
    listItem: style({
      borderRadius: "0.5rem",
      backgroundColor: nord[1],
      border: `1px solid ${nord[2]}`,
      padding: "1rem",
      transition: "all 0.2s ease",
      ":hover": {
        borderColor: nord[3],
        boxShadow: `0 2px 8px ${nord[0]}66`,
      },
    }),
  },
  lifeLogTree: {
    selected: style({
      backgroundColor: nord[2],
      borderRadius: "0.25rem",
      boxShadow: `0 0 0 2px ${nord[9]}`,
    }),
    container: style({
      padding: "0.75rem",
      borderRadius: "0.25rem",
      transition: "all 0.2s ease",
      cursor: "pointer",
      ":hover": {
        backgroundColor: `${nord[2]}44`,
      },
    }),
    timeRange: style({
      display: "flex",
      gap: "0.5rem",
      fontSize: "0.875rem",
      color: nord[3],
      marginBottom: "0.5rem",
      fontWeight: 500,
    }),
    text: style({
      fontSize: "1rem",
      lineHeight: 1.5,
      color: nord[4],
    }),
    childrenNodes: style({
      marginTop: "0.75rem",
      paddingLeft: "1.5rem",
      borderLeft: `2px solid ${nord[2]}`,
    }),
  },
};

globalStyle("body", {
  fontFamily: "sans-serif",
  color: nord[5],
  backgroundColor: nord[0],

  boxSizing: "border-box",
  height: "calc(100svh - env(keyboard-inset-height))",
  margin: 0,
  padding: 8,
});

globalStyle("button", {
  fontFamily: "inherit",
  fontSize: "inherit",
});

globalStyle("#root", {
  width: "100%",
  height: "100%",
});
