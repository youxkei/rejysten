open CssJs

%%private(
  // from https://www.nordtheme.com/docs/colors-and-palettes
  let nord = [
    hex("2E3440"),
    hex("3B4252"),
    hex("434C5E"),
    hex("4C566A"),
    hex("D8DEE9"),
    hex("E5E9F0"),
    hex("ECEFF4"),
    hex("8FBCBB"),
    hex("88C0D0"),
    hex("81A1C1"),
    hex("5E81AC"),
    hex("BF616A"),
    hex("D08770"),
    hex("EBCB8B"),
    hex("A3BE8C"),
    hex("B48EAD"),
  ]
)

module Note = {
  let s = style(. [
    display(grid),
    gridTemplateColumns([20.0->pct, 80.0->pct]),
    width(100.0->pct),
    height(100.0->pct),
  ])

  module DocumentPane = {
    let s = style(. [gridColumnStart(1), overflow(auto)])
  }

  module ItemPane = {
    let s = style(. [gridColumnStart(2), overflow(auto)])
  }

  let focusedPane = style(. [border(8->px, solid, nord[1])])
  let unfocusedPane = style(. [border(8->px, solid, nord[0])])

  let item = style(. [width(100.0->pct), height(100.0->pct)])
  module List = {
    let container = style(. [
      display(grid),
      gridTemplateColumns([32->px, 4->px, auto]),
      gridTemplateRows([auto, auto]),
      width(100.0->pct),
    ])

    let bullet = style(. [gridColumnStart(1), textAlign(#right)])
    let item = style(. [gridColumnStart(3), width(100.0->pct)])
    let child = style(. [gridColumnStart(3), gridRowStart(2), width(100.0->pct)])
  }
}

let editor = style(. [
  backgroundColor(nord[1]),
  width(100.0->pct),
  borderStyle(none),
  outlineStyle(none),
  padding(0->px),
])
let searchEditor = style(. [borderStyle(none), outlineStyle(none), padding(0->px)])

let focused = style(. [backgroundColor(nord[1])])

global(.
  "body",
  [color(nord[5]), backgroundColor(nord[0]), fontFamily(#sansSerif), fontSize(16->px)],
)
global(.
  "textarea",
  [color(nord[5]), backgroundColor(transparent), fontFamily(#sansSerif), fontSize(16->px)],
)
global(.
  "input",
  [color(nord[5]), backgroundColor(transparent), fontFamily(#sansSerif), fontSize(16->px)],
)
global(. "p", [margin(0->px)])
global(. "pre", [margin(0->px)])
global(. "a:link", [color(nord[7])])
global(. "a:visited", [color(nord[7])])
global(. ".hljs", [backgroundColor(transparent)])
global(.
  "code",
  [
    backgroundColor(nord[2]),
    border(1->px, solid, nord[10]),
    borderRadius(3->px),
    padding(3->px),
    margin2(~v=0->px, ~h=3->px),
    verticalAlign(8.0->pct),
  ],
)
global(.
  "code.hljs",
  [backgroundColor(nord[2]), border(1->px, solid, nord[10]), borderRadius(3->px), padding(3->px)],
)
