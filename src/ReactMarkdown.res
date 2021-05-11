type props = {"children": string}
@obj external makeProps: (~children: string, unit) => props = ""
@module("react-markdown") external make: React.component<props> = "default"
