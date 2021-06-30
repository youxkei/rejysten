open Belt

@react.component
let make = React.memo(() => {
  let items = Redux.useSelector(State.SearchPane.items)

  React.array(items->Array.map(item => <p key={item.id}> {item.text->React.string} </p>))
})

React.setDisplayName(make, "SearchItems")
