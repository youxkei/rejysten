open Belt

module type ItemsInnerType = {
	let make: ({"item": Item.item}) => ReasonReact.reactElement
	let makeProps: (~item: 'item, ~key: string=?, unit) => {"item": 'item}
}

module rec ItemsInner: ItemsInnerType = {
    @react.component
    let make = (~item) => {
        let Item.Item({subitems}) = item
        <>
            <li><ItemEditor item /></li>
            <ul>
                {subitems->Array.map(item => {
                    let Item.Item({id}) = item
                    <ItemsInner item key=id />
                })->React.array}
            </ul>
        </>
    }
}

@react.component
let make = (~items) => {
    <ul>
        {items->Belt.Array.map(item => {
            let Item.Item({id}) = item
            <ItemsInner item key=id />
        })->React.array}
    </ul>
}
