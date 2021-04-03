open Belt

let makeChildren = (documentItemMap, item: State.item) => {
  let children = []

  let currentItem = ref(documentItemMap->HashMap.String.get(item.firstChildId))

  while Option.isSome(currentItem.contents) {
    let item: State.item = Option.getExn(currentItem.contents)

    let _ = children->Js.Array2.push(item)
    currentItem := documentItemMap->HashMap.String.get(item.nextId)
  }

  children
}

module type ItemsInnerType = {
  let make: {
    "item": State.item,
    "mode": State.mode,
    "currentDocumentItemId": string,
    "documentItemMap": HashMap.String.t<State.item>,
  } => ReasonReact.reactElement
  let makeProps: (
    ~item: State.item,
    ~mode: 'mode,
    ~currentDocumentItemId: 'currentDocumentItemId,
    ~documentItemMap: 'documentItemMap,
    ~key: string=?,
    unit,
  ) => {"item": State.item, "mode": 'mode, "currentDocumentItemId": 'currentDocumentItemId, "documentItemMap": 'documentItemMap}
}

module rec ItemsInner: ItemsInnerType = {
  @react.component
  let make = (~item: State.item, ~mode, ~currentDocumentItemId, ~documentItemMap) => {
    let children: array<State.item> = makeChildren(documentItemMap, item)
    let isCurrentItem = item.id == currentDocumentItemId
    let isTrivialDocument = documentItemMap->HashMap.String.size == 2

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
          <ItemsInner key=item.id item mode currentDocumentItemId documentItemMap />
        })
        ->React.array}
      </ul>
    </>
  }
}

@react.component
let make = (~item: State.item, ~mode, ~currentDocumentItemId, ~documentItemMap) => {
  <ul>
    {makeChildren(documentItemMap, item)
    ->Array.map(item => {
      <ItemsInner key=item.id item mode currentDocumentItemId documentItemMap />
    })
    ->React.array}
  </ul>
}
