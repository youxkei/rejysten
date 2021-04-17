open Belt

@send external focus: Dom.element => unit = "focus"
@send external setSelectionRange: (Dom.element, int, int) => unit = "setSelectionRange"
@get external value: Js.t<'a> => string = "value"

@react.component
let make = React.memo((~item: State.item, ~initialCursorPosition) => {
  let text = Redux.useSelector(State.editingDocumentItemText)

  let dispatch = Redux.useDispatch()

  let handleChange = React.useCallback1(event => {
    dispatch(Action.SetDocumentItemEditingText({text: event->ReactEvent.Form.target->value}))
  }, [])

  let handleFocusOut = React.useCallback1(_ => {
    dispatch(Action.FirestoreItem(Action.Save))
  }, [text])

  let textareaRef = React.useRef(Js.Nullable.null)

  React.useEffect1(() => {
    textareaRef.current
    ->Js.Nullable.toOption
    ->Option.forEach(textarea => {
      textarea->focus

      switch (initialCursorPosition: State.initialCursorPosition) {
      | Start => textarea->setSelectionRange(0, 0)

      | End => {
          let length = text->Js.String.length
          textarea->setSelectionRange(length, length)
        }
      }
    })

    None
  }, [])

  <textarea
    value=text
    ref={ReactDOM.Ref.domRef(textareaRef)}
    onChange=handleChange
    onBlur=handleFocusOut
  />
})

React.setDisplayName(make, "ItemEditor")
