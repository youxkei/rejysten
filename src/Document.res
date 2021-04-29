@react.component
let make = React.memo((~document: State.document) => {
  let currentDocumentId = Redux.useSelector(State.Document.currentId)
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
