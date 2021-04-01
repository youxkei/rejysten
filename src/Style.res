open CssJs

let app = style(. [
  display(grid),
  gridTemplateColumns([20.0->pct, 80.0->pct]),

  width(100.0->pct),
  height(100.0->pct),
])

let documents = style(. [
  gridColumn(1, 1),
  overflow(auto)
])

let document = style(. [
  gridColumn(2, 2),
  overflow(auto)
])
