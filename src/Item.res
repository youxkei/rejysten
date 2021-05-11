@react.component
let make = React.memo((~item: State.item) => {
  <ReactMarkdown> {item.text} </ReactMarkdown>
})

React.setDisplayName(make, "Item")
