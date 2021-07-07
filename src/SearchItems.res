open Belt

@react.component
let make = React.memo(() => {
  let items = Redux.useSelector(State.SearchPane.items)

  <ul> {React.array(items->Array.map(item => <li key={item.id}> <Item item /> </li>))} </ul>
})

React.setDisplayName(make, "SearchItems")
