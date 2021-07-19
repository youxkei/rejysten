open Belt

@send external focus: Dom.element => unit = "focus"
@send external setSelectionRange: (Dom.element, int, int) => unit = "setSelectionRange"
@get external value: Js.t<'a> => string = "value"

@react.component
let make = React.memo(() => {
  let text = Redux.useSelector(State.Note.ItemPane.editingText)
  let initialCursorPosition = Redux.useSelector(State.initialCursorPosition)

  let dispatch = Redux.useDispatch()

  let onChange = React.useCallback1(event => {
    dispatch(
      Action.Note(
        Action.ItemPane(Action.SetEditingText({text: event->ReactEvent.Form.target->value})),
      ),
    )
  }, [])

  let onBlur = React.useCallback1(_ => {
    dispatch(Action.FirestoreNote(Action.ItemPane(Action.SaveItem())))
    dispatch(Action.Note(Action.ItemPane(Action.ToNormalMode())))
  }, [])

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
    className={`${Style.editor} ${Style.Note.List.item}`}
    ref={ReactDOM.Ref.domRef(textareaRef)}
    value=text
    onChange
    onBlur
  />
})

React.setDisplayName(make, "ItemEditor")
