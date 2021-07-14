open Belt

@send external focus: Dom.element => unit = "focus"
@send external setSelectionRange: (Dom.element, int, int) => unit = "setSelectionRange"
@get external value: Js.t<'a> => string = "value"

@react.component
let make = React.memo(() => {
  let dispatch = Redux.useDispatch()

  let text = Redux.useSelector(State.Search.searchingText)
  let textareaRef = React.useRef(Js.Nullable.null)

  let onChange = React.useCallback1(event => {
    dispatch(Action.Search(Action.SetSearchingText({text: event->ReactEvent.Form.target->value})))
  }, [])

  React.useEffect1(() => {
    textareaRef.current
    ->Js.Nullable.toOption
    ->Option.forEach(textarea => {
      let length = text->Js.String.length

      textarea->focus
      textarea->setSelectionRange(length, length)
    })

    None
  }, [])

  <>
    {"/"->React.string}
    <textarea ref={ReactDOM.Ref.domRef(textareaRef)} value=text onChange autoFocus=true />
    <SearchItems />
  </>
})

React.setDisplayName(make, "SearchPane")
