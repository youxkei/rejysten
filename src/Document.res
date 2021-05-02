@react.component
let make = React.memo((~document: State.document) => {
  <span > {document.text->React.string} </span>
})
