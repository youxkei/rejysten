type remarkPlugin

type props = {"children": string, "remarkPlugins": array<remarkPlugin>}
@obj
external makeProps: (~children: string, ~remarkPlugins: array<remarkPlugin>, unit) => props = ""
@module("react-markdown") external make: React.component<props> = "default"

@module("remark-gfm") @val
external gfm: remarkPlugin = "default"

@module("remark-highlight.js") @val
external highlight: remarkPlugin = "default"
