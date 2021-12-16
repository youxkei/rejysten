let clickEventTargetCreator = itemId => Event.Note(Event.ItemPane({itemId: itemId}))

@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(Selector.focus)
  let itemMap = Redux.useSelector(Selector.Firestore.itemMap)
  let selectedItemId = Redux.useSelector(Selector.Note.ItemPane.selectedItemId)

  let rootItem = Redux.useSelector(Selector.Note.ItemPane.rootItem)
  let (rootItem, ()) = Hook.useDebounce(rootItem, 50)

  let focusable = switch focus {
  | State.Note(State.ItemPane()) => true
  | _ => false
  }

  let className = switch focus {
  | State.Note(State.ItemPane()) => `${Style.Note.itemPane} ${Style.Note.focusedPane}`

  | _ => `${Style.Note.itemPane} ${Style.Note.unfocusedPane}`
  }

  switch rootItem {
  | Some(item) =>
    <section className>
      <Items editable=true focusable item selectedItemId itemMap clickEventTargetCreator />
    </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItemPane")
