open List

let items = [
    Item({id: "1", text: "hoge", subitems: [
        Item({id: "2", text: "piyo", subitems: []}),
    ]}),
    Item({id: "3", text: "fuga", subitems: []}),
]

switch ReactDOM.querySelector("#app") {
    | Some(app) => ReactDOM.render(<List items />, app)
    | None => ()
}
