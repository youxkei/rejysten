open Belt

@send external focus: Dom.element => unit = "focus"
@send external setSelectionRange: (Dom.element, int, int) => unit = "setSelectionRange"
@get external value: Js.t<'a> => string = "value"

@react.component
let make = React.memo(() => {
  let text = Redux.useSelector(State.DocumentPane.editingText)
  let initialCursorPosition = Redux.useSelector(State.initialCursorPosition)

  let dispatch = Redux.useDispatch()

  let handleChange = React.useCallback1(event => {
    dispatch(Action.DocumentPane(Action.SetEditingText({text: event->ReactEvent.Form.target->value})))
  }, [])

  let handleFocusOut = React.useCallback1(_ => {
    dispatch(Action.FirestoreDocumentPane(Action.SaveDocument()))
  }, [])

  let textareaRef = React.useRef(Js.Nullable.null)

  React.useEffect1(() => {
    textareaRef.current
    ->Js.Nullable.toOption
    ->Option.forEach(textarea => {
      textarea->focus

      switch initialCursorPosition {
      | State.Start => textarea->setSelectionRange(0, 0)

      | State.End => {
          let length = text->Js.String.length
          textarea->setSelectionRange(length, length)
        }
      }
    })

    None
  }, [])

  <textarea
    className={Style.editor}
    value=text
    ref={ReactDOM.Ref.domRef(textareaRef)}
    onChange=handleChange
    onBlur=handleFocusOut
  />
})

React.setDisplayName(make, "DocumentEditor")