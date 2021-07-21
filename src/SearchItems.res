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
    React.array(
      items->Array.map(item =>
        <RenderIfVisible key={item.id} defaultHeight={window->outerHeight}>
          <div className=Style.List.container>
            <div className=Style.List.bullet> <Bullet /> </div>
            <div className=Style.List.item> <Item item /> </div>
          </div>
        </RenderIfVisible>
      ),
    )
  }
})

React.setDisplayName(make, "SearchItems")
