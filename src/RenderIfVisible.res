type props = {"children": React.element, "defaultHeight": float}

@obj external makeProps: (~children: React.element, ~defaultHeight: float, unit) => props = ""

@module("react-render-if-visible")
external make: React.component<props> = "default"
