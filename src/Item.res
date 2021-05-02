@react.component
let make = React.memo((~item: State.documentItem) => {
  <span> {item.text->React.string} </span>
})

React.setDisplayName(make, "Item")
