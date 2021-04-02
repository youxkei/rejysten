open Belt

let makeChildren = (itemsMap, item: State.item) => {
  let children = []

  let currentItem = ref(itemsMap->HashMap.String.get(item.firstChildId))

  while Option.isSome(currentItem.contents) {
    let item: State.item = Option.getExn(currentItem.contents)

    let _ = children->Js.Array2.push(item)
    currentItem := itemsMap->HashMap.String.get(item.nextId)
  }

  children
}

module type ItemsInnerType = {
  let make: {
    "item": State.item,
    "mode": State.mode,
    "currentItemId": string,
    "itemsMap": HashMap.String.t<State.item>,
  } => ReasonReact.reactElement
  let makeProps: (
    ~item: State.item,
    ~mode: 'mode,
    ~currentItemId: 'currentItemId,
    ~itemsMap: 'itemsMap,
    ~key: string=?,
    unit,
  ) => {"item": State.item, "mode": 'mode, "currentItemId": 'currentItemId, "itemsMap": 'itemsMap}
}

module rec ItemsInner: ItemsInnerType = {
  @react.component
  let make = (~item: State.item, ~mode, ~currentItemId, ~itemsMap) => {
    let children: array<State.item> = makeChildren(itemsMap, item)
    let isCurrentItem = item.id == currentItemId
    let isTrivialDocument = itemsMap->HashMap.String.size == 2

    <>
      <li>
        {switch mode {
        | State.Insert({initialCursorPosition}) if isCurrentItem =>
          <ItemEditor item initialCursorPosition isTrivialDocument />
        | _ => <Item item isCurrent=isCurrentItem />
        }}
      </li>
      <ul>
        {children
        ->Array.map((item: State.item) => {
          <ItemsInner key=item.id item mode currentItemId itemsMap />
        })
        ->React.array}
      </ul>
    </>
  }
}

@react.component
let make = (~item: State.item, ~mode, ~currentItemId, ~itemsMap) => {
  <ul>
    {makeChildren(itemsMap, item)
    ->Array.map(item => {
      <ItemsInner key=item.id item mode currentItemId itemsMap />
    })
    ->React.array}
  </ul>
}
