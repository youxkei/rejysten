open Belt

let makeSubitems = (itemsMap, item: State.item) => {
  let subitems = []

  let currentItem = ref(itemsMap->HashMap.String.get(item.firstSubitemId))

  while Option.isSome(currentItem.contents) {
    let item: State.item = Option.getExn(currentItem.contents)

    let _ = subitems->Js.Array2.push(item)
    currentItem := itemsMap->HashMap.String.get(item.nextId)
  }

  subitems
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
    let subitems: array<State.item> = makeSubitems(itemsMap, item)
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
        {subitems
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
    {makeSubitems(itemsMap, item)
    ->Array.map(item => {
      <ItemsInner key=item.id item mode currentItemId itemsMap />
    })
    ->React.array}
  </ul>
}
