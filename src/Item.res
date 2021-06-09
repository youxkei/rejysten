@react.component
let make = React.memo((~item: State.item) => {
  let dispatch = Redux.useDispatch()

  let onClick = React.useCallback1(_ => {
    dispatch(Action.FocusDocumentItemPane())
    dispatch(
      Action.DocumentItemPane(
        Action.SetCurrentItem({id: item.id, initialCursorPosition: State.End}),
      ),
    )
  }, [item.id])

  let onDoubleClick = React.useCallback1(_ => {
    dispatch(Action.FocusDocumentItemPane())
    dispatch(
      Action.DocumentItemPane(
        Action.SetCurrentItem({id: item.id, initialCursorPosition: State.End}),
      ),
    )
    dispatch(Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.End})))
  }, [item.id])

  <div onClick onDoubleClick>
    <ReactMarkdown
      remarkPlugins={[ReactMarkdown.gfm, ReactMarkdown.externalLinks, ReactMarkdown.highlight]}>
      {item.text}
    </ReactMarkdown>
  </div>
})

React.setDisplayName(make, "Item")
