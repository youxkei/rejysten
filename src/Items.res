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
	let make: ({"itemsMap": HashMap.String.t<Item.item>, "item": Item.item}) => ReasonReact.reactElement
	let makeProps: (~itemsMap: 'itemsMap, ~item: 'item, ~key: string=?, unit) => {"itemsMap": 'itemsMap, "item": 'item}
}

module rec ItemsInner: ItemsInnerType = {
    @react.component
    let make = (~itemsMap, ~item) => {
        let subitems: array<Item.item> = makeSubitems(itemsMap, item)
        <>
            <li><ItemEditor item /></li>
            <ul>
                {subitems->Array.map(item => {
                    let Item.Item({id}) = item
                    <ItemsInner itemsMap item key=id />
                })->React.array}
            </ul>
        </>
    }
}

@react.component
let make = (~itemsMap, ~item) => {
    <ul>
        {makeSubitems(itemsMap, item)->Belt.Array.map(item => {
            let Item.Item({id}) = item
            <ItemsInner itemsMap item key=id />
        })->React.array}
    </ul>
}
