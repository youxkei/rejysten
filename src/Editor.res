open Belt

@send external focus: Dom.element => unit = "focus"
@send external setSelectionRange: (Dom.element, int, int) => unit = "setSelectionRange"
@get external value: Js.t<'a> => string = "value"

@react.component
let make = () => {
  let text = Redux.useSelector(State.Editor.editingText)
  let initialCursorPosition = Redux.useSelector(State.initialCursorPosition)

  let dispatch = Redux.useDispatch()

  let onChange = event => {
    dispatch(Action.Editor(Action.SetEditingText({text: event->ReactEvent.Form.target->value})))
  }

  let onBlur = event => {
    dispatch(Action.Event(Event.Blur({event: event})))
  }

  let textareaRef = React.useRef(Js.Nullable.null)

  React.useEffect1(() => {
    textareaRef.current
    ->Js.Nullable.toOption
    ->Option.forEach(textarea => {
      textarea->focus

      switch initialCursorPosition {
      | State.Start() => textarea->setSelectionRange(0, 0)

      | State.End() => {
          let length = text->Js.String.length
          textarea->setSelectionRange(length, length)
        }
      }
    })

    None
  }, [])

  <ReactTextareaAutosize
    className=Style.Note.editor ref={ReactDOM.Ref.domRef(textareaRef)} value=text onChange onBlur
  />
}