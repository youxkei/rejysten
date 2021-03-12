@module("firebase/app") external firebase: 'any = "default"

%%private(
  let keyCode = ReactEvent.Keyboard.keyCode
  let target = ReactEvent.Form.target
)

@react.component
let make = (~item) => {
  let Item.Item({id, text}) = item

  let (text, setText) = React.useState(() => text)

  let handleChange = event => {
    setText(target(event)["value"])
  }

  let handleKeyDown = event => {
    let keyCode = keyCode(event)

    switch keyCode {
    | 27 => firebase["firestore"]()["collection"]("items")["doc"](id)["update"]({"text": text})

    | _ => ()
    }
  }

  <textarea value=text onChange=handleChange onKeyDown=handleKeyDown />
}
