type props = {"children": React.element, "defaultHeight": float, "key": string}

@obj
external makeProps: (~children: React.element, ~defaultHeight: float, ~key: string, unit) => props =
  ""

@module("react-render-if-visible")
external make: React.component<props> = "default"
