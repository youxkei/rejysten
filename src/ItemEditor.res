open Belt

@send external focus: Dom.element => unit = "focus"
@get external value: Js.t<'a> => string = "value"

@react.component
let make = (~item) => {
  let State.Item({id, text, firstSubitem, lastSubitem}) = item

  let (text, setText) = React.useState(_ => text)

  let dispatch = Redux.useDispatch()
  let editing = Redux.useSelector(State.editing)
  let itemsMap = Redux.useSelector(State.itemsMap)
  let currentItem = Redux.useSelector(State.currentItem)

  let itemsNum = itemsMap->HashMap.String.size

  let handleChange = React.useCallback1(event => {
    setText(_ => event->ReactEvent.Form.target->value)
  }, [])

  let handleKeyDown = React.useCallback1(event => {
    let preventDefault = ReactEvent.Synthetic.preventDefault

    let keyCode = event->ReactEvent.Keyboard.keyCode
    let shiftKey = event->ReactEvent.Keyboard.shiftKey
    let ctrlKey = event->ReactEvent.Keyboard.ctrlKey

    Js.log(j`$keyCode, $shiftKey, $ctrlKey`)

    switch keyCode {
    | 27 => {
        dispatch(Action.Firestore(Action.SaveItem({text: text})))
      }

    | 9 if !shiftKey => {
        dispatch(Action.Firestore(Action.IndentItem({text: text})))
        event->preventDefault
      }

    | 9 if shiftKey => {
        dispatch(Action.Firestore(Action.UnindentItem({text: text})))
        event->preventDefault
      }

    | 13 if ctrlKey => {
        dispatch(Action.Firestore(Action.AddItem({text: text})))
        event->preventDefault
      }

    | 8 if itemsNum > 2 && text == "" && firstSubitem == "" && lastSubitem == "" => {
        dispatch(Action.Firestore(Action.DeleteItem))
        event->preventDefault
      }

    | _ => ()
    }
  }, [text])

  let handleFocusOut = React.useCallback1(_ => {
    Js.log("focus out")
    dispatch(Action.Firestore(Action.SaveItem({text: text})))
  }, [text])

  let textareaRef = React.useRef(Js.Nullable.null)

  React.useEffect1(() => {
    if id == currentItem && editing {
      textareaRef.current->Js.Nullable.toOption->Option.forEach(textarea => textarea->focus)
    }
    None
  }, [(currentItem, editing)])

  <textarea
    value=text
    ref={ReactDOM.Ref.domRef(textareaRef)}
    onChange=handleChange
    onKeyDown=handleKeyDown
    onBlur=handleFocusOut
  />
}
