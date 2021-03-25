open Belt

let makeSubitems = (itemsMap, item) => {
  let subitems = []

  let State.Item({firstSubitem}) = item
  let currentItem = ref(itemsMap->HashMap.String.get(firstSubitem))

  while Option.isSome(currentItem.contents) {
    let item = Option.getExn(currentItem.contents)
    let State.Item({next}) = item

    let _ = subitems->Js.Array2.push(item)
    currentItem := itemsMap->HashMap.String.get(next)
  }

  subitems
}

module type ItemsInnerType = {
  let make: {
    "item": State.item,
  } => ReasonReact.reactElement
  let makeProps: (
    ~item: 'item,
    ~key: string=?,
    unit,
  ) => {"item": 'item}
}

module rec ItemsInner: ItemsInnerType = {
  @react.component
  let make = (~item) => {
    let itemsMap = Redux.useSelector(State.itemsMap)
    let currentItem = Redux.useSelector(State.currentItem)
    let editing = Redux.useSelector(State.editing)

    let State.Item({id}) = item
    let subitems: array<State.item> = makeSubitems(itemsMap, item)

    <>
      <li>
        {if id == currentItem && editing {
          <ItemEditor item />
        } else {
          <Item item />
        }}
      </li>
      <ul>
        {subitems
        ->Array.map(item => {
          let State.Item({id}) = item
          <ItemsInner item key=id />
        })
        ->React.array}
      </ul>
    </>
  }
}

@react.component
let make = (~item) => {
  let itemsMap = Redux.useSelector(State.itemsMap)

  <ul>
    {makeSubitems(itemsMap, item)
    ->Array.map(item => {
      let State.Item({id}) = item
      <ItemsInner item key=id />
    })
    ->React.array}
  </ul>
}
