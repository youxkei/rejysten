import { style, globalStyle, keyframes } from "@vanilla-extract/css";

const shareSpin = keyframes({
  to: { transform: "rotate(360deg)" },
});

const toastSlideIn = keyframes({
  from: {
    transform: "translateX(-50%) translateY(100%)",
    opacity: 0,
  },
  to: {
    transform: "translateX(-50%) translateY(0)",
    opacity: 1,
  },
});

const toastSlideOut = keyframes({
  from: {
    transform: "translateX(-50%) translateY(0)",
    opacity: 1,
  },
  to: {
    transform: "translateX(-50%) translateY(100%)",
    opacity: 0,
  },
});

export const MOBILE_BREAKPOINT = 1024;

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
  app: {
    wrapper: style({
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }),
    configRow: style({
      display: "flex",
      gap: "0.5rem",
    }),
    errors: style({
      margin: "0.5rem 0",
    }),
    main: style({
      flex: 1,
      minHeight: 0,
    }),
  },
  lifeLogs: {
    wrapper: style({
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }),
    container: style({
      flex: 1,
      minHeight: 0,
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
      "@media": {
        [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
          flexDirection: "column-reverse",
        },
      },
    }),
    listItem: style({
      borderRadius: "0.5rem",
      backgroundColor: nord[1],
      border: `1px solid ${nord[2]}`,
      padding: "1rem",
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
      cursor: "pointer",
      ":hover": {
        backgroundColor: `${nord[2]}44`,
      },
    }),
    timeRange: style({
      display: "flex",
      gap: "0.5rem",
      fontSize: "0.875rem",
      color: nord[4],
      marginBottom: "0.5rem",
      fontWeight: 500,
    }),
    text: style({
      fontSize: "1rem",
      lineHeight: 1.5,
      color: nord[4],
      minHeight: "1.5em",
    }),
    childrenNodes: style({
      marginTop: "0.75rem",
      paddingLeft: "1.5rem",
      borderLeft: `2px solid ${nord[2]}`,
    }),
    editInput: style({
      backgroundColor: "transparent",
      border: "none",
      outline: "none",
      fontSize: "1rem",
      lineHeight: 1.5,
      color: nord[4],
      width: "100%",
      padding: 0,
      margin: 0,
      fontFamily: "inherit",
      minHeight: "1.5em",
    }),
  },
  mobileToolbar: {
    container: style({
      backgroundColor: nord[1],
      borderTop: `1px solid ${nord[2]}`,
      padding: "0.5rem",
      display: "none",
      justifyContent: "flex-end",
      gap: "0.25rem",
      "@media": {
        [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
          display: "flex",
        },
      },
    }),
    buttonGroup: style({
      display: "flex",
      gap: "0.25rem",
      flexWrap: "wrap",
      justifyContent: "flex-end",
    }),
    button: style({
      padding: "0.5rem 0.75rem",
      backgroundColor: nord[2],
      border: `1px solid ${nord[3]}`,
      borderRadius: "0.25rem",
      color: nord[5],
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
      minWidth: "2.5rem",
      ":active": {
        backgroundColor: nord[3],
      },
    }),
  },
  search: {
    wrapper: style({
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }),
    inputContainer: style({
      padding: "1rem",
      borderBottom: `1px solid ${nord[2]}`,
    }),
    input: style({
      width: "100%",
      padding: "0.75rem",
      backgroundColor: nord[1],
      border: `1px solid ${nord[2]}`,
      borderRadius: "0.25rem",
      color: nord[4],
      fontSize: "1rem",
      fontFamily: "inherit",
      outline: "none",
      ":focus": {
        borderColor: nord[9],
        boxShadow: `0 0 0 2px ${nord[9]}44`,
      },
    }),
    resultsContainer: style({
      flex: 1,
      minHeight: 0,
      overflow: "auto",
      padding: "1rem",
    }),
    resultsList: style({
      listStyle: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
    }),
    result: style({
      display: "flex",
      flexDirection: "column",
      gap: "0.25rem",
      padding: "0.75rem",
      backgroundColor: nord[1],
      borderRadius: "0.25rem",
      cursor: "pointer",
      ":hover": {
        backgroundColor: `${nord[2]}44`,
      },
    }),
    resultSelected: style({
      backgroundColor: nord[2],
      boxShadow: `0 0 0 2px ${nord[9]}`,
    }),
    resultCollection: style({
      fontSize: "0.75rem",
      color: nord[3],
      textTransform: "uppercase",
    }),
    resultText: style({
      fontSize: "1rem",
      lineHeight: 1.5,
      color: nord[4],
    }),
  },
  toast: {
    success: style({
      position: "fixed",
      bottom: "1rem",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "0.75rem 1.5rem",
      borderRadius: "0.5rem",
      backgroundColor: nord[14],
      color: nord[0],
      fontSize: "0.875rem",
      fontWeight: 500,
      zIndex: 1000,
      boxShadow: `0 4px 12px ${nord[0]}88`,
      cursor: "pointer",
      animationName: toastSlideIn,
      animationDuration: "0.3s",
      animationTimingFunction: "ease-out",
      animationFillMode: "forwards",
    }),
    successHiding: style({
      position: "fixed",
      bottom: "1rem",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "0.75rem 1.5rem",
      borderRadius: "0.5rem",
      backgroundColor: nord[14],
      color: nord[0],
      fontSize: "0.875rem",
      fontWeight: 500,
      zIndex: 1000,
      boxShadow: `0 4px 12px ${nord[0]}88`,
      cursor: "pointer",
      animationName: toastSlideOut,
      animationDuration: "0.3s",
      animationTimingFunction: "ease-in",
      animationFillMode: "forwards",
    }),
    error: style({
      position: "fixed",
      bottom: "1rem",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "0.75rem 1.5rem",
      borderRadius: "0.5rem",
      backgroundColor: nord[11],
      color: nord[6],
      fontSize: "0.875rem",
      fontWeight: 500,
      zIndex: 1000,
      boxShadow: `0 4px 12px ${nord[0]}88`,
      cursor: "pointer",
      animationName: toastSlideIn,
      animationDuration: "0.3s",
      animationTimingFunction: "ease-out",
      animationFillMode: "forwards",
    }),
    errorHiding: style({
      position: "fixed",
      bottom: "1rem",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "0.75rem 1.5rem",
      borderRadius: "0.5rem",
      backgroundColor: nord[11],
      color: nord[6],
      fontSize: "0.875rem",
      fontWeight: 500,
      zIndex: 1000,
      boxShadow: `0 4px 12px ${nord[0]}88`,
      cursor: "pointer",
      animationName: toastSlideOut,
      animationDuration: "0.3s",
      animationTimingFunction: "ease-in",
      animationFillMode: "forwards",
    }),
  },
  share: {
    wrapper: style({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: "1.5rem",
      color: nord[4],
      fontSize: "1rem",
    }),
    spinner: style({
      width: "2.5rem",
      height: "2.5rem",
      border: `3px solid ${nord[2]}`,
      borderTopColor: nord[8],
      borderRadius: "50%",
      animationName: shareSpin,
      animationDuration: "0.8s",
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
    }),
    text: style({
      fontSize: "1.125rem",
      fontWeight: 500,
      color: nord[4],
    }),
  },
};

globalStyle("body", {
  fontFamily: "sans-serif",
  color: nord[5],
  backgroundColor: nord[0],

  boxSizing: "border-box",
  height: "calc(100svh - env(keyboard-inset-height, 0px))",
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

globalStyle("#storybook-root", {
  width: "100%",
  height: "100%",
});
