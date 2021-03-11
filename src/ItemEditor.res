@bs.module("firebase/app") external firebase: 'any = "default"

@react.component
let make = (~item) => {
    let Item.Item({text}) = item

    let (text, setText) = React.useState(() => text)

    let handleChange = event => {
        setText(ReactEvent.Form.target(event)["value"])
    }

    <textarea value=text onChange=handleChange />
}
