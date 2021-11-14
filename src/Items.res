open Belt

@send
external getBoundingClientRect: Dom.element => {
  "left": int,
  "right": int,
  "top": int,
  "bottom": int,
} = "getBoundingClientRect"
@send
external scrollIntoView: (
  Dom.element,
  {"behavior": string, "block": string, "inline": string},
) => unit = "scrollIntoView"

let makeChildren = (itemMap, item: State.item) => {
  let rec makeChildren = (itemId, children) => {
    switch itemMap->Map.String.get(itemId) {
    | Some(item: State.item) =>
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
    "isFocused": bool,
    "item": State.item,
    "selectedItemId": string,
    "itemMap": State.itemMap,
  } => ReasonReact.reactElement
  let makeProps: (
    ~editable: bool,
    ~isFocused: bool,
    ~item: State.item,
    ~selectedItemId: string,
    ~itemMap: State.itemMap,
    ~key: string=?,
    unit,
  ) => {
    "isFocused": bool,
    "editable": bool,
    "item": State.item,
    "selectedItemId": string,
    "itemMap": State.itemMap,
  }
} = {
  @react.component
  let make = (~editable, ~isFocused, ~item: State.item, ~selectedItemId, ~itemMap) => {
    let mode = Redux.useSelector(State.mode)
    let listItemRef = React.useRef(Js.Nullable.null)
    let innerHeight = Hook.useInnerHeight()

    let isSelectedItem = item.id == selectedItemId

    React.useEffect2(() => {
      if isSelectedItem {
        listItemRef.current
        ->Js.Nullable.toOption
        ->Option.forEach(listItem => {
          let rect = listItem->getBoundingClientRect

          if rect["top"] < Style.globalMargin {
            listItem->scrollIntoView({"behavior": "auto", "block": "start", "inline": "nearest"})
          }

          if rect["bottom"] > innerHeight - Style.globalMargin {
            listItem->scrollIntoView({"behavior": "auto", "block": "end", "inline": "nearest"})
          }
        })
      }

      None
    }, (isSelectedItem, innerHeight))

    <BulletList
      bullet={<Bullet />}
      item={switch (isFocused, editable, mode, isSelectedItem) {
      | (true, true, State.Insert(_), true) => <Editor />

      | _ => <Item item />
      }}
      isSelectedItem
      itemRef={ReactDOM.Ref.domRef(listItemRef)}
      child={makeChildren(itemMap, item)
      ->Array.map((item: State.item) => {
        <ItemsInner key=item.id editable isFocused item selectedItemId itemMap />
      })
      ->React.array}
    />
  }
}

@react.component
let make = (~editable, ~isFocused, ~item, ~selectedItemId, ~itemMap) => {
  makeChildren(itemMap, item)
  ->Array.map(item => {
    <ItemsInner key=item.id editable isFocused item selectedItemId itemMap />
  })
  ->React.array
}
