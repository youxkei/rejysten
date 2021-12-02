@react.component
let make = React.memo((~item: State.Item.t) => {
  let dispatch = Redux.useDispatch()

  let onClick = Hook.useDouble(React.useCallback1((event, isDouble) => {
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

  <div className=Style.item onClick>
    <ReactMarkdown
      className=Style.markdown
      remarkPlugins={[ReactMarkdown.gfm, ReactMarkdown.externalLinks, ReactMarkdown.highlight]}>
      {item.text}
    </ReactMarkdown>
  </div>
})

React.setDisplayName(make, "Item")
