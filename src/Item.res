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
        event->ReactEvent.Mouse.preventDefault
      } else {
        dispatch(Action.DocumentItemPane(Action.ToNormalMode()))
      }
    }, [item.id]))

  let onTouchEnd = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      if event->ReactEvent.Touch.cancelable {
        dispatch(Action.FocusDocumentItemPane())
        dispatch(
          Action.DocumentItemPane(
            Action.SetCurrentItem({id: item.id, initialCursorPosition: State.End}),
          ),
        )

        if isDouble {
          dispatch(Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.End})))
          event->ReactEvent.Touch.preventDefault
        } else {
          dispatch(Action.DocumentItemPane(Action.ToNormalMode()))
        }
      }
    }, [item.id]))

  <div onClick onTouchEnd>
    <ReactMarkdown
      remarkPlugins={[ReactMarkdown.gfm, ReactMarkdown.externalLinks, ReactMarkdown.highlight]}>
      {item.text}
    </ReactMarkdown>
  </div>
})

React.setDisplayName(make, "Item")
