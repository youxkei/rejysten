open Belt

@react.component
let make = React.memo(() => {
  let items = Redux.useSelector(State.Search.items)

  if items->Array.length == 0 {
    <p> {React.string("Not Available")} </p>
  } else {
    <ul> {React.array(items->Array.map(item => <li key={item.id}> <Item item /> </li>))} </ul>
  }
})

React.setDisplayName(make, "SearchItems")
