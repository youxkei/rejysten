@react.component
let make = React.memo((~document: State.Document.t) => {
  let currentDocumentId = Redux.useSelector(State.currentDocumentId)
  let focus = Redux.useSelector(State.focus)

  let className = if document.id == currentDocumentId {
    switch focus {
    | State.Documents => Style.currentFocused

    | _ => Style.currentUnfocused
    }
  } else {
    ""
  }

  <span className> {document.text->React.string} </span>
})
