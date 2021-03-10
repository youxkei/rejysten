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
            <li><Item item /></li>
            <ul>
                {subitems->Array.map(item => {
                    let Item.Item({id, text}) = item
                    <ItemsInner item key={`${id}-${text}`} />
                })->React.array}
            </ul>
        </>
    }
}

@react.component
let make = (~items) => {
    <ul>
        {items->Belt.Array.map(item => {
            let Item.Item({id, text}) = item
            <ItemsInner item key={`${id}-${text}`} />
        })->React.array}
    </ul>
}
