@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(State.focus)
  let rootItem = Redux.useSelector(State.Note.ItemPane.rootItem)

  let className = switch focus {
  | State.Note(State.ItemPane()) => `${Style.Note.ItemPane.s} ${Style.Note.focusedPane}`

  | _ => `${Style.Note.ItemPane.s} ${Style.Note.unfocusedPane}`
  }

  switch rootItem {
  | Some(item) => <section className> <NoteItems item /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItemPane")
