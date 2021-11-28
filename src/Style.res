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

let globalMargin = 8

module BulletList = {
  let itemMinHeight = 27->px

  let container = style(. [
    display(grid),
    gridTemplateColumns([32->px, 8->px, auto]),
    gridTemplateRows([auto, auto]),
    width(100.0->pct),
  ])

  let bullet = style(. [
    gridColumnStart(1),
    minHeight(itemMinHeight),
    display(flexBox),
    alignItems(center),
    justifyContent(flexEnd),
  ])
  let item = style(. [
    gridColumnStart(3),
    minHeight(itemMinHeight),
    display(flexBox),
    alignItems(center),
  ])
  let selectedItem = merge(. [item, style(. [backgroundColor(nord[1])])])
  let child = style(. [gridColumnStart(3), gridRowStart(2), width(100.0->pct)])
}

let item = style(. [width(100.0->pct)])
let inlineEditor = style(. [
  backgroundColor(nord[1]),
  borderStyle(none),
  outlineStyle(none),
  padding(0->px),
])
let blockEditor = merge(. [inlineEditor, style(. [width(100.0->pct)])])

let markdown = style(. [
  selector(" > p", [display(inlineFlex), flexWrap(wrap), alignItems(center), columnGap(3->px)]),
  selector(".hljs", [backgroundColor(transparent)]),
  selector(
    "code",
    [
      backgroundColor(nord[2]),
      border(1->px, solid, nord[10]),
      borderRadius(3->px),
      padding4(~bottom=0->px, ~top=2->px, ~left=1->px, ~right=1->px),
      display(inlineBlock),
      boxSizing(borderBox),
    ],
  ),
])

module Note = {
  let documentPane = style(. [gridColumnStart(1), overflow(auto)])
  let itemPane = style(. [gridColumnStart(2), overflow(auto)])

  let focusedPane = style(. [])
  let unfocusedPane = style(. [backgroundColor(nord[0]), filter([#brightness(75.0)])])

  let document = style(. [width(100.0->pct)])

  let style = style(. [
    display(grid),
    gridTemplateColumns([20.0->pct, 80.0->pct]),
    width(100.0->pct),
    height(100.0->pct),
  ])
}

module Search = {
  let editor = style(. [borderStyle(none), outlineStyle(none), padding(0->px)])
}

module ActionLog = {
  let actionLog = style(. [width(100.0->pct)])

  let style = style(. [width(100.0->pct), height(100.0->pct), overflow(auto)])
}

global(.
  "body",
  [
    color(nord[5]),
    backgroundColor(nord[0]),
    fontFamily(#sansSerif),
    fontSize(16->px),
    margin(globalMargin->px),
    unsafe("touch-action", "manipulation"),
  ],
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
