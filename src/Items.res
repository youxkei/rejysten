open Belt

@send external getBoundingClientRect: Dom.element => {"left": int, "right": int, "top": int, "bottom": int} = "getBoundingClientRect"
@send external scrollIntoView: (Dom.element, {"behavior": string, "block": string, "inline": string}) => unit = "scrollIntoView"
@val @bs.scope("window") external innerHeight: int = "innerHeight"

%%private(
  let makeChildren = (documentItemMap, item: State.documentItem) => {
    let children = []

    let currentItem = ref(documentItemMap->HashMap.String.get(item.firstChildId))

    while Option.isSome(currentItem.contents) {
      let item: State.documentItem = Option.getExn(currentItem.contents)

      let _ = children->Js.Array2.push(item)
      currentItem := documentItemMap->HashMap.String.get(item.nextId)
    }

    children
  }
)

module type ItemsInnerType = {
  let make: {"item": State.documentItem} => ReasonReact.reactElement
  let makeProps: (~item: State.documentItem, ~key: string=?, unit) => {"item": State.documentItem}
}

module rec ItemsInner: ItemsInnerType = {
  @react.component
  let make = React.memo((~item: State.documentItem) => {
    let focus = Redux.useSelector(State.focus)
    let mode = Redux.useSelector(State.mode)
    let documentItemMap = Redux.useSelector(State.DocumentItemPane.map)
    let currentDocumentItemId = Redux.useSelector(State.DocumentItemPane.currentId)
    let liRef = React.useRef(Js.Nullable.null)

    let isCurrentItem = item.id == currentDocumentItemId

    React.useEffect1(() => {
      if isCurrentItem {
        liRef.current
        ->Js.Nullable.toOption
        ->Option.forEach(li => {
          let rect = li->getBoundingClientRect

          if rect["top"] < 0 {
            li->scrollIntoView({"behavior": "auto", "block": "start", "inline": "nearest"})
          }

          if rect["bottom"] > innerHeight {
            li->scrollIntoView({"behavior": "auto", "block": "end", "inline": "nearest"})
          }
        })
      }

      None
    }, [isCurrentItem])

    let className = if isCurrentItem {
      switch focus {
      | State.DocumentItemPane => Style.currentFocused

      | _ => Style.currentUnfocused
      }
    } else {
      ""
    }

    <>
      <li className ref={ReactDOM.Ref.domRef(liRef)}>
        {switch (focus, mode, isCurrentItem) {
        | (State.DocumentItemPane, State.Insert(_), true) => <ItemEditor />

        | _ => <Item item />
        }}
      </li>
      <ul>
        {makeChildren(documentItemMap, item)
        ->Array.map((item: State.documentItem) => {
          <ItemsInner key=item.id item />
        })
        ->React.array}
      </ul>
    </>
  })

  React.setDisplayName(make, "ItemsInner")
}

@react.component
let make = React.memo((~item: State.documentItem) => {
  let documentItemMap = Redux.useSelector(State.DocumentItemPane.map)

  <ul>
    {makeChildren(documentItemMap, item)
    ->Array.map(item => {
      <ItemsInner key=item.id item />
    })
    ->React.array}
  </ul>
})

React.setDisplayName(make, "Items")
