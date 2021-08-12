@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(State.focus)
  let rootItem = Redux.useSelector(State.Note.ItemPane.rootItem)
  let (rootItem, ()) = Hook.useDebounce(rootItem, 50)

  let className = switch focus {
  | State.Note(State.ItemPane()) => `${Style.Note.itemPane} ${Style.Note.focusedPane}`

  | _ => `${Style.Note.itemPane} ${Style.Note.unfocusedPane}`
  }

  switch rootItem {
  | Some(item) => <section className> <NoteItems item /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItemPane")
