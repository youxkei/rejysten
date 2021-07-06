@react.component
let make = React.memo((~item: State.item) => {
  let dispatch = Redux.useDispatch()

  let onClick = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      dispatch(
        Action.Event(
          Event.Click({
            event: Event.Mouse(event),
            isDouble: isDouble,
            target: Event.Item(item.id),
          }),
        ),
      )
    }, [item.id]))

  let onTouchEnd = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      dispatch(
        Action.Event(
          Event.Click({
            event: Event.Touch(event),
            isDouble: isDouble,
            target: Event.Item(item.id),
          }),
        ),
      )
    }, [item.id]))

  <div onClick onTouchEnd>
    <ReactMarkdown
      remarkPlugins={[ReactMarkdown.gfm, ReactMarkdown.externalLinks, ReactMarkdown.highlight]}>
      {`${item.text}　`}
    </ReactMarkdown>
  </div>
})

React.setDisplayName(make, "Item")
