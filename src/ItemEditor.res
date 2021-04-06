open Belt

@send external focus: Dom.element => unit = "focus"
@send external setSelectionRange: (Dom.element, int, int) => unit = "setSelectionRange"
@get external value: Js.t<'a> => string = "value"

@react.component
let make = React.memo((~item: State.item, ~isTrivialDocument, ~initialCursorPosition) => {
  let (text, setText) = React.useState(_ => item.text)

  let dispatch = Redux.useDispatch()

  let handleChange = React.useCallback1(event => {
    setText(_ => event->ReactEvent.Form.target->value)
  }, [])

  let handleKeyDown = React.useCallback1(event => {
    let preventDefault = ReactEvent.Synthetic.preventDefault

    let key = event->ReactEvent.Keyboard.key
    let shiftKey = event->ReactEvent.Keyboard.shiftKey

    switch key {
    | "Escape" => dispatch(Action.FirestoreItem(Action.Save({text: text})))

    | "Tab" if !shiftKey => {
        dispatch(Action.FirestoreItem(Action.Indent({text: text})))
        event->preventDefault
      }

    | "Tab" if shiftKey => {
        dispatch(Action.FirestoreItem(Action.Unindent({text: text})))
        event->preventDefault
      }

    | "Enter" if !shiftKey => {
        dispatch(Action.FirestoreItem(Action.Add({text: Some(text), direction: Action.Next})))
        event->preventDefault
      }

    | "Backspace"
      if !isTrivialDocument && text == "" && item.firstChildId == "" && item.lastChildId == "" => {
        dispatch(Action.FirestoreItem(Action.Delete))
        event->preventDefault
      }

    | _ => ()
    }
  }, [text])

  let handleFocusOut = React.useCallback1(_ => {
    dispatch(Action.FirestoreItem(Action.Save({text: text})))
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
    onKeyDown=handleKeyDown
    onBlur=handleFocusOut
  />
})

React.setDisplayName(make, "ItemEditor")
