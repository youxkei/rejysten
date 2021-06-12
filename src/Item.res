@send external preventDefault: ReactEvent.Mouse.t => unit = "preventDefault"

@react.component
let make = React.memo((~item: State.item) => {
  let dispatch = Redux.useDispatch()

  let onClick = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      dispatch(Action.FocusDocumentItemPane())
      dispatch(
        Action.DocumentItemPane(
          Action.SetCurrentItem({id: item.id, initialCursorPosition: State.End}),
        ),
      )

      if isDouble {
        dispatch(Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.End})))
      }

      event->preventDefault
    }, [item.id]))

  <div onClick>
    <ReactMarkdown
      remarkPlugins={[ReactMarkdown.gfm, ReactMarkdown.externalLinks, ReactMarkdown.highlight]}>
      {item.text}
    </ReactMarkdown>
  </div>
})

React.setDisplayName(make, "Item")
