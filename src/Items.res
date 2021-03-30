open Belt

let makeSubitems = (itemsMap, item) => {
  let subitems = []

  let State.Item({firstSubitemId}) = item
  let currentItem = ref(itemsMap->HashMap.String.get(firstSubitemId))

  while Option.isSome(currentItem.contents) {
    let item = Option.getExn(currentItem.contents)
    let State.Item({nextId}) = item

    let _ = subitems->Js.Array2.push(item)
    currentItem := itemsMap->HashMap.String.get(nextId)
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
    ~item: 'item,
    ~mode: 'mode,
    ~currentItemId: 'currentItemId,
    ~itemsMap: 'itemsMap,
    ~key: string=?,
    unit,
  ) => {"item": 'item, "mode": 'mode, "currentItemId": 'currentItemId, "itemsMap": 'itemsMap}
}

module rec ItemsInner: ItemsInnerType = {
  @react.component
  let make = (~item, ~mode, ~currentItemId, ~itemsMap) => {
    let State.Item({id: itemId}) = item
    let subitems: array<State.item> = makeSubitems(itemsMap, item)
    let isCurrentItem = itemId == currentItemId
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
        ->Array.map(item => {
          let State.Item({id}) = item
          <ItemsInner key=id item mode currentItemId itemsMap />
        })
        ->React.array}
      </ul>
    </>
  }
}

@react.component
let make = (~item, ~mode, ~currentItemId, ~itemsMap) => {
  <ul>
    {makeSubitems(itemsMap, item)
    ->Array.map(item => {
      let State.Item({id}) = item
      <ItemsInner key=id item mode currentItemId itemsMap />
    })
    ->React.array}
  </ul>
}
