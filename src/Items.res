open Belt

@send
external getBoundingClientRect: Dom.element => {
  "left": int,
  "right": int,
  "top": int,
  "bottom": int,
} = "getBoundingClientRect"
@send
external scrollIntoView: (Dom.element, {"block": string}) => unit = "scrollIntoView"

let makeChildren = (itemMap, item: State.Item.t) => {
  let rec makeChildren = (itemId, children) => {
    switch itemMap->Map.String.get(itemId) {
    | Some(item: State.Item.t) =>
      let _ = children->Js.Array2.push(item)
      makeChildren(item.nextId, children)

    | None => children
    }
  }

  makeChildren(item.firstChildId, [])
}

module rec ItemsInner: {
  let make: {
    "editable": bool,
    "focusable": bool,
    "item": State.Item.t,
    "selectedItemId": string,
    "itemMap": State.Item.map,
  } => ReasonReact.reactElement
  let makeProps: (
    ~editable: bool,
    ~focusable: bool,
    ~item: State.Item.t,
    ~selectedItemId: string,
    ~itemMap: State.Item.map,
    ~key: string=?,
    unit,
  ) => {
    "focusable": bool,
    "editable": bool,
    "item": State.Item.t,
    "selectedItemId": string,
    "itemMap": State.Item.map,
  }
} = {
  @react.component
  let make = (~editable, ~focusable, ~item: State.Item.t, ~selectedItemId, ~itemMap) => {
    let mode = Redux.useSelector(Selector.mode)
    let listItemRef = React.useRef(Js.Nullable.null)
    let innerHeight = Hook.useInnerHeight()

    let isSelectedItem = focusable && item.id == selectedItemId

    React.useEffect2(() => {
      if isSelectedItem {
        listItemRef.current
        ->Js.Nullable.toOption
        ->Option.forEach(listItem => {
          let rect = listItem->getBoundingClientRect

          if rect["top"] < Style.globalMargin {
            listItem->scrollIntoView({"block": "start"})
          }

          if rect["bottom"] > innerHeight - Style.globalMargin {
            listItem->scrollIntoView({"block": "end"})
          }
        })
      }

      None
    }, (isSelectedItem, innerHeight))

    <BulletList
      bullet={<Bullet />}
      item={switch (focusable, editable, mode, isSelectedItem) {
      | (true, true, State.Insert(_), true) => <Editor />

      | _ => <Item item />
      }}
      isSelectedItem
      itemRef={ReactDOM.Ref.domRef(listItemRef)}
      child={makeChildren(itemMap, item)
      ->Array.map((item: State.Item.t) => {
        <ItemsInner key=item.id editable focusable item selectedItemId itemMap />
      })
      ->React.array}
    />
  }
}

@react.component
let make = (~editable, ~focusable, ~item, ~selectedItemId, ~itemMap) => {
  makeChildren(itemMap, item)
  ->Array.map(item => {
    <ItemsInner key=item.id editable focusable item selectedItemId itemMap />
  })
  ->React.array
}
