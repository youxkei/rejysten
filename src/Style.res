open CssJs

let app = style(. [
  display(grid),
  gridTemplateColumns([20.0->pct, 80.0->pct]),

  width(100.0->pct),
  height(100.0->pct),
])

let documentPane = style(. [
  gridColumnStart(1),
  overflow(auto)
])

let documentItemPane = style(. [
  gridColumnStart(2),
  overflow(auto)
])

let editor = style(. [
  width(100.0->pct)
])

let currentFocused = style(. [
  backgroundColor(hex("434C5E"))
])

let currentUnfocused = style(. [
  backgroundColor(hex("3B4252"))
])

global(. "body", [
  color(hex("D8DEE9")),
  backgroundColor(hex("2E3440"))
])
