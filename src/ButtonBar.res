@val @scope("window")
external dispatchKeyboardEvent: Dom.keyboardEvent => unit = "dispatchEvent"

@new
external makeKeyboardEvent: (
  string,
  {"code": string, "shiftKey": bool, "ctrlKey": bool, "location": int},
) => Dom.keyboardEvent = "KeyboardEvent"

module Button = {
  @react.component
  let make = (~text, ~code, ~shift=false, ~ctrl=false, ~insert=false) => {
    let location = if insert {
      42
    } else {
      0
    }

    <button
      className=Style.ButtonBar.button
      onClick={_ => {
        dispatchKeyboardEvent(
          makeKeyboardEvent(
            "keydown",
            {
              "code": code,
              "shiftKey": shift,
              "ctrlKey": ctrl,
              "location": location,
            },
          ),
        )
      }}>
      {text->React.string}
    </button>
  }
}

@react.component
let make = () => {
  <div className=Style.ButtonBar.style>
    <Button text="N" code="KeyN" shift=true />
    <Button text="L" code="KeyL" shift=true />
    <Button text="j" code="KeyJ" />
    <Button text="k" code="KeyK" />
    <Button text="g" code="KeyG" />
    <Button text="G" code="KeyG" shift=true />
    <Button text="h" code="KeyH" />
    <Button text="l" code="KeyL" />
    <Button text="i" code="KeyI" />
    <Button text="a" code="KeyA" />
    <Button text="o" code="KeyO" />
    <Button text="O" code="KeyO" shift=true />
    <Button text="Tab" code="Tab" />
    <Button text="STab" code="Tab" shift=true />
    <Button text="s" code="KeyS" />
    <Button text="f" code="KeyF" />
    <Button text="Backspace" code="Backspace" insert=true />
    <Button text="Enter" code="Enter" insert=true />
    <button className=Style.ButtonBar.button> {"Esc"->React.string} </button>
  </div>
}
