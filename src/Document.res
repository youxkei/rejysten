@react.component
let make = React.memo((~document: State.document, ~isCurrent) => {
  let className = if isCurrent {
    Style.currentDocument
  } else {
    ""
  }

  <span className> {document.text->React.string} </span>
})
