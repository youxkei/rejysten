open Belt

let makeSubitems = (itemsMap, item) => {
  let subitems = []

  let Item.Item({firstSubitem}) = item
  let currentItem = ref(itemsMap->HashMap.String.get(firstSubitem))

  while Option.isSome(currentItem.contents) {
    let item = Option.getExn(currentItem.contents)
    let Item.Item({next}) = item

    let _ = subitems->Js.Array2.push(item)
    currentItem := itemsMap->HashMap.String.get(next)
  }

  subitems
}

module type ItemsInnerType = {
  let make: {
    "document": string,
    "itemsMap": HashMap.String.t<Item.item>,
    "item": Item.item,
  } => ReasonReact.reactElement
  let makeProps: (
    ~document: 'document,
    ~itemsMap: 'itemsMap,
    ~item: 'item,
    ~key: string=?,
    unit,
  ) => {"document": 'document, "itemsMap": 'itemsMap, "item": 'item}
}

module rec ItemsInner: ItemsInnerType = {
  @react.component
  let make = (~document, ~itemsMap, ~item) => {
    let focus = Recoil.useRecoilValue(Atom.focus)

    let Item.Item({id}) = item
    let subitems: array<Item.item> = makeSubitems(itemsMap, item)

    <>
      <li> {switch focus {
        | Atom.FocusOnItem(itemId) if itemId == id => <ItemEditor document itemsMap item />
        | _ => <Item item/>
      }} </li>
      <ul>
        {subitems
        ->Array.map(item => {
          let Item.Item({id}) = item
          <ItemsInner document itemsMap item key=id />
        })
        ->React.array}
      </ul>
    </>
  }
}

@react.component
let make = (~document, ~itemsMap, ~item) => {
  <ul>
    {makeSubitems(itemsMap, item)
    ->Array.map(item => {
      let Item.Item({id}) = item
      <ItemsInner document itemsMap item key=id />
    })
    ->React.array}
  </ul>
}
