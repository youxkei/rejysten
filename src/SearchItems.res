open Belt

@val external window: Dom.window = "window"
@get
external outerHeight: Dom.window => float = "outerHeight"

@react.component
let make = React.memo(() => {
  let items = Redux.useSelector(State.Search.items)

  if items->Array.length == 0 {
    <p> {React.string("Not Available")} </p>
  } else {
    <ul>
      {React.array(
        items->Array.map(item =>
          <RenderIfVisible defaultHeight={window->outerHeight}>
            <li key={item.id}> <Item item isCurrentItem=false /> </li>
          </RenderIfVisible>
        ),
      )}
    </ul>
  }
})

React.setDisplayName(make, "SearchItems")
