open Belt

%%private(
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
)

module type ItemsInnerType = {
  let make: {"item": State.item} => ReasonReact.reactElement
  let makeProps: (~item: State.item, ~key: string=?, unit) => {"item": State.item}
}

module rec ItemsInner: ItemsInnerType = {
  @react.component
  let make = React.memo((~item: State.item) => {
    let mode = Redux.useSelector(State.mode)
    let documentItemMap = Redux.useSelector(State.documentItemMap)
    let currentDocumentItemId = Redux.useSelector(State.currentDocumentItemId)

    let isCurrentItem = item.id == currentDocumentItemId

    <>
      <li>
        {switch mode {
        | State.Insert(_) if isCurrentItem => {
            <ItemEditor />
          }

        | _ => <Item item />
        }}
      </li>
      <ul>
        {makeChildren(documentItemMap, item)
        ->Array.map((item: State.item) => {
          <ItemsInner key=item.id item />
        })
        ->React.array}
      </ul>
    </>
  })

  React.setDisplayName(make, "ItemsInner")
}

@react.component
let make = React.memo((~item: State.item) => {
  let documentItemMap = Redux.useSelector(State.documentItemMap)

  <ul>
    {makeChildren(documentItemMap, item)
    ->Array.map(item => {
      <ItemsInner key=item.id item />
    })
    ->React.array}
  </ul>
})

React.setDisplayName(make, "Items")
