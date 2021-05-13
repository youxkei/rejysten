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

let app = style(. [
  display(grid),
  gridTemplateColumns([20.0->pct, 80.0->pct]),
  width(100.0->pct),
  height(100.0->pct),
])

let documentPane = style(. [gridColumnStart(1), overflow(auto)])

let documentItemPane = style(. [gridColumnStart(2), overflow(auto)])

let focusedPane = style(. [border(8->px, solid, nord[1])])
let unfocusedPane = style(. [border(8->px, solid, nord[0])])

let editor = style(. [color(nord[5]), backgroundColor(nord[0]), width(100.0->pct)])

let focused = style(. [backgroundColor(nord[1])])

global(. "body", [color(nord[5]), backgroundColor(nord[0]), fontSize(16->px)])
global(. "p", [margin(0->px)])
global(. "pre", [margin(0->px)])
global(. "a:link", [color(nord[7])])
global(. "a:visited", [color(nord[7])])
global(. ".hljs", [backgroundColor(transparent)])
