@react.component
let make = React.memo((~item: State.item) => {
  <span> {item.text->React.string} </span>
})

React.setDisplayName(make, "Item")
