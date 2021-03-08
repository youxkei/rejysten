open List

let items = [
    Item({id: "1", text: "hoge", subitems: [
        Item({id: "2", text: "piyo", subitems: []}),
    ]}),
    Item({id: "3", text: "fuga", subitems: []}),
]

module App = {
    @react.component
    let make = () => {
        <List items />
    }
}

switch ReactDOM.querySelector("#app") {
    | Some(app) => ReactDOM.render(<App />, app)
    | None => ()
}
