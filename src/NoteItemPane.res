@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(State.focus)
  let itemMap = Redux.useSelector(State.Firestore.itemMap)
  let selectedItemId = Redux.useSelector(State.Note.ItemPane.selectedItemId)

  let rootItem = Redux.useSelector(State.Note.ItemPane.rootItem)
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
    <section className> <Items editable=true focusable item selectedItemId itemMap /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItemPane")
