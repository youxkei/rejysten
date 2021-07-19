@react.component
let make = React.memo((~item: State.item) => {
  let dispatch = Redux.useDispatch()
  let isCurrentItem = Redux.useSelector(State.Note.ItemPane.currentItemId) == item.id

  let className = if isCurrentItem {
    Style.focused
  } else {
    ""
  }

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

  let (onTouchMove, onTouchEnd, onTouchCancel) = Hook.useTouch(
    Hook.useDouble(React.useCallback1((event, isDouble) => {
        dispatch(
          Action.Event(
            Event.Click({
              event: Event.Touch(event),
              isDouble: isDouble,
              target: Event.Item(item.id),
            }),
          ),
        )
      }, [item.id])),
  )

  <div
    className={`${Style.Note.List.item} ${className}`} onClick onTouchMove onTouchEnd onTouchCancel>
    <ReactMarkdown
      remarkPlugins={[ReactMarkdown.gfm, ReactMarkdown.externalLinks, ReactMarkdown.highlight]}>
      {item.text}
    </ReactMarkdown>
  </div>
})

React.setDisplayName(make, "Item")
